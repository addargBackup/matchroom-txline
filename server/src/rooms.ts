/** Room orchestrator: subscribes rooms to fixture feed events, runs the card
 *  lifecycle, thesis reveal + Reckoning, scoring, and SSE fan-out. */
import { nanoid } from "nanoid";
import { db } from "./db.js";
import type { FixtureFeedEvent, Ingest } from "./ingest.js";
import {
  backfillCard, cardPoints, cardsForEvents, resolveCard,
  type CardContext, type OpenCard,
} from "./engine/cards.js";
import { score } from "./engine/match.js";
import { gradeThesis, thesisHealth, type Thesis } from "./engine/thesis.js";
import { botAnswer, botBanter, botThesis, BOTS } from "./ai.js";

type SseClient = { write: (chunk: string) => void };

export interface RoomStateView {
  room: { id: string; code: string; fixtureId: number; name: string | null; isDemo: boolean };
  fixture: { home: string; away: string; startTime: number | null };
  phase: "pre" | "live" | "done";
  minute: number;
  score: { home: number; away: number };
  momentum: { home: number; draw: number; away: number } | null;
  sentiment: { home: number; draw: number; away: number } | null;
  members: Array<{
    playerId: string; nickname: string; nation: string; adoptedNation: string | null;
    isBot: boolean; points: number; streak: number;
    thesis: null | {
      sealed: true; revealed: boolean;
      result?: number; scoreHome?: number; scoreAway?: number; confidence?: number;
      hotTake?: string; health?: string; points?: number; judas?: boolean; verdict?: string | null;
    };
  }>;
  openCards: Array<{ id: string; type: string; question: string; options: string[]; closesAt: number }>;
}

export class Rooms {
  private sse = new Map<string, Set<SseClient>>(); // roomId -> clients
  private openCards = new Map<string, OpenCard[]>(); // roomId -> open cards
  private lastCardFrameTs = new Map<string, number>();
  private revealed = new Set<string>();
  private reckoned = new Set<string>();

  constructor(private ingest: Ingest) {
    ingest.on("fixture", (ev: FixtureFeedEvent) => this.onFixture(ev));
    // Answer-window sweeper (wall clock) + bot answers.
    setInterval(() => this.sweep(), 1000);
  }

  // ---- CRUD -----------------------------------------------------------------
  createRoom(fixtureId: number, name: string | null, isDemo = false) {
    const id = nanoid(12);
    const code = nanoid(6).toUpperCase().replace(/[-_]/g, "X");
    db.prepare("INSERT INTO rooms (id, code, fixture_id, name, is_demo, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, code, fixtureId, name, isDemo ? 1 : 0, Date.now());
    return { id, code };
  }

  roomByCode(code: string) {
    return db.prepare("SELECT * FROM rooms WHERE code = ?").get(code.toUpperCase()) as
      | { id: string; code: string; fixture_id: number; name: string | null; is_demo: number }
      | undefined;
  }

  join(roomId: string, playerId: string) {
    db.prepare("INSERT OR IGNORE INTO members (room_id, player_id, joined_at) VALUES (?,?,?)")
      .run(roomId, playerId, Date.now());
  }

  createPlayer(nickname: string, nation: string, isBot = false, persona: string | null = null): string {
    const id = nanoid(14);
    db.prepare("INSERT INTO players (id, nickname, nation, is_bot, persona, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, nickname.slice(0, 24), nation, isBot ? 1 : 0, persona, Date.now());
    return id;
  }

  sealThesis(roomId: string, playerId: string, t: Thesis & { hotTake: string }) {
    const room = db.prepare("SELECT fixture_id FROM rooms WHERE id = ?").get(roomId) as { fixture_id: number };
    const match = this.ingest.matchFor(room.fixture_id);
    if (match.kickoff) throw new Error("kickoff has passed — theses are sealed at kickoff");
    db.prepare(`INSERT INTO theses (room_id, player_id, result, score_home, score_away, confidence, hot_take, sealed_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(room_id, player_id) DO UPDATE SET result=excluded.result, score_home=excluded.score_home,
        score_away=excluded.score_away, confidence=excluded.confidence, hot_take=excluded.hot_take, sealed_at=excluded.sealed_at`)
      .run(roomId, playerId, t.result, t.scoreHome, t.scoreAway, t.confidence, t.hotTake.slice(0, 140), Date.now());
    this.broadcast(roomId, { type: "thesis_sealed", playerId });
  }

  answerCard(cardId: string, playerId: string, choice: number) {
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId) as
      | { id: string; room_id: string; state: string; closes_at: number; options_json: string }
      | undefined;
    if (!card || card.state !== "open") throw new Error("card is not open");
    if (Date.now() > card.closes_at) throw new Error("answer window closed");
    if (choice < 0 || choice >= (JSON.parse(card.options_json) as string[]).length) throw new Error("bad choice");
    db.prepare("INSERT OR IGNORE INTO answers (card_id, player_id, choice) VALUES (?,?,?)").run(cardId, playerId, choice);
    this.broadcast(card.room_id, { type: "answer_in", cardId, playerId });
  }

  // ---- feed handling ----------------------------------------------------------
  private roomsForFixture(fixtureId: number) {
    return db.prepare("SELECT * FROM rooms WHERE fixture_id = ?").all(fixtureId) as Array<{
      id: string; code: string; fixture_id: number; name: string | null; is_demo: number;
    }>;
  }

  private onFixture(ev: FixtureFeedEvent) {
    for (const room of this.roomsForFixture(ev.fixtureId)) {
      const ctx: CardContext = {
        match: ev.match,
        momentum: ev.momentum,
        teams: this.ingest.teamsFor(ev.fixtureId),
        open: this.openCards.get(room.id) ?? [],
        lastCardFrameTs: this.lastCardFrameTs.get(room.id) ?? 0,
      };

      // Kickoff -> thesis reveal (once)
      if (ev.match.kickoff && !this.revealed.has(room.id)) {
        this.revealed.add(room.id);
        db.prepare("UPDATE theses SET revealed = 1 WHERE room_id = ?").run(room.id);
        this.broadcast(room.id, { type: "thesis_reveal" });
      }

      // Semantic events -> broadcast + new cards
      for (const e of ev.events) {
        if (["goal", "corner", "yellow", "red", "var", "var_outcome"].includes(e.kind)) {
          this.broadcast(room.id, { type: "match_event", event: e, score: score(ev.match), minute: ev.match.minute });
          void this.botBanterFor(room.id, e.kind, ctx);
        }
      }
      for (const spec of cardsForEvents(ctx, ev.events)) this.openCard(room.id, ctx, spec);
      const fill = backfillCard(ctx);
      if (fill) this.openCard(room.id, ctx, fill);

      // Resolve open cards
      const stillOpen: OpenCard[] = [];
      for (const card of this.openCards.get(room.id) ?? []) {
        const res = resolveCard(card, ctx, ev.events);
        if (res === null) stillOpen.push(card);
        else this.settleCard(room.id, card, "void" in res ? null : res.answerIndex);
      }
      this.openCards.set(room.id, stillOpen);

      if (ev.source === "odds" && ev.momentum.latest) {
        this.broadcast(room.id, { type: "momentum", point: ev.momentum.latest });
      }

      // Full time -> the Reckoning (once)
      if (ev.match.finalised && !this.reckoned.has(room.id)) {
        this.reckoned.add(room.id);
        this.reckon(room.id, ev);
      }
    }
  }

  private openCard(roomId: string, ctx: CardContext, spec: import("./engine/cards.js").CardSpec) {
    const id = nanoid(10);
    const card: OpenCard = { ...spec, id, openedWallTs: Date.now(), openedFrameTs: ctx.match.lastFrameTs };
    db.prepare("INSERT INTO cards (id, room_id, type, question, options_json, opens_at, closes_at, meta_json) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, roomId, spec.type, spec.question, JSON.stringify(spec.options), card.openedWallTs,
        card.openedWallTs + spec.answerWindowMs, JSON.stringify(spec.meta));
    this.openCards.set(roomId, [...(this.openCards.get(roomId) ?? []), card]);
    this.lastCardFrameTs.set(roomId, ctx.match.lastFrameTs);
    this.broadcast(roomId, {
      type: "card_open",
      card: { id, type: spec.type, question: spec.question, options: spec.options, closesAt: card.openedWallTs + spec.answerWindowMs },
    });
    // Bots answer on a human-ish delay.
    setTimeout(() => this.botsAnswer(roomId, card, ctx), 2500 + Math.random() * 5000);
  }

  private settleCard(roomId: string, card: OpenCard, answerIndex: number | null) {
    db.prepare("UPDATE cards SET state = ?, answer_index = ? WHERE id = ?")
      .run(answerIndex === null ? "void" : "resolved", answerIndex, card.id);
    const results: Array<{ playerId: string; correct: boolean; points: number }> = [];
    if (answerIndex !== null) {
      const answers = db.prepare("SELECT player_id, choice FROM answers WHERE card_id = ?").all(card.id) as
        Array<{ player_id: string; choice: number }>;
      for (const a of answers) {
        const member = db.prepare("SELECT streak FROM members WHERE room_id = ? AND player_id = ?")
          .get(roomId, a.player_id) as { streak: number };
        const correct = a.choice === answerIndex;
        const pts = correct ? cardPoints(member?.streak ?? 0) : 0;
        db.prepare("UPDATE answers SET correct = ?, points = ? WHERE card_id = ? AND player_id = ?")
          .run(correct ? 1 : 0, pts, card.id, a.player_id);
        db.prepare("UPDATE members SET points = points + ?, streak = ? WHERE room_id = ? AND player_id = ?")
          .run(pts, correct ? (member?.streak ?? 0) + 1 : 0, roomId, a.player_id);
        db.prepare("UPDATE players SET total_points = total_points + ? WHERE id = ?").run(pts, a.player_id);
        results.push({ playerId: a.player_id, correct, points: pts });
      }
    }
    this.broadcast(roomId, { type: "card_result", cardId: card.id, answerIndex, results });
  }

  /** Full time: grade every thesis, award, emit the ceremony. */
  private reckon(roomId: string, ev: FixtureFeedEvent) {
    const final = score(ev.match);
    const fixture = this.ingest.fixtures.get(ev.fixtureId);
    const rows = db.prepare(
      `SELECT t.*, p.nation, p.adopted_nation, p.nickname, p.persona, p.is_bot FROM theses t
       JOIN players p ON p.id = t.player_id WHERE t.room_id = ? AND t.graded = 0`,
    ).all(roomId) as Array<Record<string, unknown>>;

    const graded: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const nation = (r.adopted_nation as string) ?? (r.nation as string);
      const side = fixture
        ? nation === fixture.Participant1 ? 0 : nation === fixture.Participant2 ? 2 : null
        : null;
      const grade = gradeThesis(
        {
          result: r.result as 0 | 1 | 2,
          scoreHome: r.score_home as number,
          scoreAway: r.score_away as number,
          confidence: r.confidence as 1 | 2 | 3,
        },
        final,
        { playerNationSide: side as 0 | 2 | null },
      );
      db.prepare("UPDATE theses SET graded = 1, points = ?, judas = ? WHERE room_id = ? AND player_id = ?")
        .run(grade.points, grade.judas ? 1 : 0, roomId, r.player_id);
      db.prepare("UPDATE members SET points = points + ? WHERE room_id = ? AND player_id = ?")
        .run(grade.points, roomId, r.player_id);
      db.prepare("UPDATE players SET total_points = total_points + ? WHERE id = ?").run(grade.points, r.player_id);
      graded.push({
        playerId: r.player_id, nickname: r.nickname, ...grade,
        result: r.result, scoreHome: r.score_home, scoreAway: r.score_away,
        confidence: r.confidence, hotTake: r.hot_take, sealedAt: r.sealed_at,
      });
    }
    this.broadcast(roomId, { type: "reckoning", final, graded });
    void this.botVerdicts(roomId, graded, final);
  }

  // ---- bots -------------------------------------------------------------------
  seedBots(roomId: string, fixtureId: number) {
    const teams = this.ingest.teamsFor(fixtureId);
    for (const bot of BOTS) {
      const nation = bot.allegiance(teams);
      const playerId = this.createPlayer(bot.name, nation, true, bot.key);
      this.join(roomId, playerId);
      const t = botThesis(bot, teams, this.ingest.momentumFor(fixtureId));
      db.prepare(`INSERT OR IGNORE INTO theses (room_id, player_id, result, score_home, score_away, confidence, hot_take, sealed_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(roomId, playerId, t.result, t.scoreHome, t.scoreAway, t.confidence, t.hotTake, Date.now());
    }
  }

  private botsAnswer(roomId: string, card: OpenCard, ctx: CardContext) {
    const bots = db.prepare(
      `SELECT p.id, p.persona FROM members m JOIN players p ON p.id = m.player_id
       WHERE m.room_id = ? AND p.is_bot = 1`,
    ).all(roomId) as Array<{ id: string; persona: string }>;
    for (const b of bots) {
      const bot = BOTS.find((x) => x.key === b.persona);
      if (!bot) continue;
      try {
        this.answerCard(card.id, b.id, botAnswer(bot, card, ctx));
      } catch {
        /* window closed — bots miss sometimes, that's fine */
      }
    }
  }

  private async botBanterFor(roomId: string, kind: string, ctx: CardContext) {
    const line = await botBanter(kind, ctx);
    if (line) this.broadcast(roomId, { type: "banter", ...line });
  }

  private async botVerdicts(roomId: string, graded: Array<Record<string, unknown>>, final: { home: number; away: number }) {
    for (const g of graded) {
      if (!g.hotTake) continue;
      const { verdictFor } = await import("./ai.js");
      const verdict = await verdictFor(String(g.hotTake), final, Boolean(g.resultCorrect));
      db.prepare("UPDATE theses SET verdict = ? WHERE room_id = ? AND player_id = ?")
        .run(verdict, roomId, g.playerId);
      this.broadcast(roomId, { type: "verdict", playerId: g.playerId, verdict });
    }
  }

  // ---- sweeping ----------------------------------------------------------------
  private sweep() {
    // Close answer windows visually (cards stay open until the FEED decides).
    // Nothing to do server-side beyond bot answer scheduling; kept for future.
  }

  // ---- views -------------------------------------------------------------------
  stateView(roomId: string, forPlayerId?: string): RoomStateView {
    const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId) as {
      id: string; code: string; fixture_id: number; name: string | null; is_demo: number;
    };
    const match = this.ingest.matchFor(room.fixture_id);
    const momentum = this.ingest.momentumFor(room.fixture_id).latest;
    const fixture = this.ingest.fixtures.get(room.fixture_id);
    const teams = this.ingest.teamsFor(room.fixture_id);
    const live = score(match);

    const members = db.prepare(
      `SELECT m.player_id, m.points, m.streak, p.nickname, p.nation, p.adopted_nation, p.is_bot
       FROM members m JOIN players p ON p.id = m.player_id WHERE m.room_id = ? ORDER BY m.points DESC`,
    ).all(roomId) as Array<Record<string, unknown>>;

    const theses = new Map(
      (db.prepare("SELECT * FROM theses WHERE room_id = ?").all(roomId) as Array<Record<string, unknown>>)
        .map((t) => [t.player_id as string, t]),
    );

    // Room sentiment (pre-match momentum substitute): share of theses per side.
    let sent: RoomStateView["sentiment"] = null;
    if (theses.size > 0) {
      const counts = [0, 0, 0];
      for (const t of theses.values()) counts[t.result as number]++;
      const total = counts[0] + counts[1] + counts[2];
      sent = { home: counts[0] / total, draw: counts[1] / total, away: counts[2] / total };
    }

    const openCards = (db.prepare("SELECT * FROM cards WHERE room_id = ? AND state = 'open'").all(roomId) as Array<Record<string, unknown>>)
      .map((c) => ({
        id: c.id as string, type: c.type as string, question: c.question as string,
        options: JSON.parse(c.options_json as string) as string[], closesAt: c.closes_at as number,
      }));

    return {
      room: { id: room.id, code: room.code, fixtureId: room.fixture_id, name: room.name, isDemo: !!room.is_demo },
      fixture: { home: teams.home, away: teams.away, startTime: fixture?.StartTime ?? null },
      phase: match.finalised ? "done" : match.kickoff ? "live" : "pre",
      minute: match.minute,
      score: live,
      momentum,
      sentiment: sent,
      members: members.map((m) => {
        const t = theses.get(m.player_id as string);
        const revealed = !!t?.revealed;
        const mine = m.player_id === forPlayerId;
        return {
          playerId: m.player_id as string, nickname: m.nickname as string,
          nation: m.nation as string, adoptedNation: (m.adopted_nation as string) ?? null,
          isBot: !!m.is_bot, points: m.points as number, streak: m.streak as number,
          thesis: t
            ? revealed || mine
              ? {
                  sealed: true as const, revealed,
                  result: t.result as number, scoreHome: t.score_home as number, scoreAway: t.score_away as number,
                  confidence: t.confidence as number, hotTake: t.hot_take as string,
                  health: match.kickoff && !match.finalised
                    ? thesisHealth(
                        { result: t.result as 0 | 1 | 2, scoreHome: t.score_home as number, scoreAway: t.score_away as number, confidence: t.confidence as 1 | 2 | 3 },
                        live, match.minute, match.finalised,
                      )
                    : undefined,
                  points: (t.points as number) ?? 0, judas: !!t.judas, verdict: (t.verdict as string) ?? null,
                }
              : { sealed: true as const, revealed: false }
            : null,
        };
      }),
      openCards,
    };
  }

  // ---- SSE ---------------------------------------------------------------------
  subscribe(roomId: string, client: SseClient): () => void {
    if (!this.sse.has(roomId)) this.sse.set(roomId, new Set());
    this.sse.get(roomId)!.add(client);
    return () => this.sse.get(roomId)?.delete(client);
  }

  broadcast(roomId: string, payload: Record<string, unknown>) {
    const clients = this.sse.get(roomId);
    if (!clients?.size) return;
    const chunk = `data: ${JSON.stringify(payload)}\n\n`;
    for (const c of clients) {
      try {
        c.write(chunk);
      } catch {
        clients.delete(c);
      }
    }
  }
}
