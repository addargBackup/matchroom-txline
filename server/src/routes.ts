/** REST + SSE API. Identity is a client-held playerId token (hackathon-grade);
 *  Sign-in-with-Solana links a wallet to the profile (track eligibility). */
import type { FastifyInstance } from "fastify";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { db } from "./db.js";
import type { Ingest } from "./ingest.js";
import type { Rooms } from "./rooms.js";

export function registerRoutes(app: FastifyInstance, ingest: Ingest, rooms: Rooms) {
  // ---- fixtures ------------------------------------------------------------
  app.get("/api/fixtures", async () => {
    const now = Date.now();
    return {
      fixtures: [...ingest.fixtures.values()]
        .filter((f) => f.StartTime > now - 3 * 3600_000)
        .sort((a, b) => a.StartTime - b.StartTime)
        .slice(0, 30)
        .map((f) => ({
          fixtureId: f.FixtureId, home: f.Participant1, away: f.Participant2, startTime: f.StartTime,
        })),
    };
  });

  // ---- players ---------------------------------------------------------------
  app.post<{ Body: { nickname: string; nation: string } }>("/api/players", async (req, reply) => {
    const { nickname, nation } = req.body ?? {};
    if (!nickname?.trim() || !nation?.trim()) return reply.code(400).send({ error: "nickname and nation required" });
    const playerId = rooms.createPlayer(nickname.trim(), nation.trim());
    return { playerId };
  });

  app.post<{ Body: { playerId: string; adoptedNation: string } }>("/api/players/adopt", async (req, reply) => {
    const { playerId, adoptedNation } = req.body ?? {};
    if (!playerId || !adoptedNation) return reply.code(400).send({ error: "playerId and adoptedNation required" });
    db.prepare("UPDATE players SET adopted_nation = ? WHERE id = ?").run(adoptedNation, playerId);
    return { ok: true };
  });

  /** Sign-in with Solana: verify an ed25519 signMessage over a challenge. */
  app.post<{ Body: { playerId: string; wallet: string; signature: number[]; message: string } }>(
    "/api/players/link-wallet",
    async (req, reply) => {
      const { playerId, wallet, signature, message } = req.body ?? {};
      try {
        if (!message?.startsWith("MatchRoom link:")) throw new Error("bad challenge");
        const pk = new PublicKey(wallet);
        const ok = nacl.sign.detached.verify(
          new TextEncoder().encode(message),
          Uint8Array.from(signature),
          pk.toBytes(),
        );
        if (!ok) throw new Error("signature verification failed");
        db.prepare("UPDATE players SET wallet = ? WHERE id = ?").run(pk.toBase58(), playerId);
        return { ok: true, wallet: pk.toBase58() };
      } catch (err) {
        return reply.code(400).send({ error: String(err).slice(0, 160) });
      }
    },
  );

  // ---- rooms --------------------------------------------------------------------
  app.post<{ Body: { fixtureId: number; name?: string } }>("/api/rooms", async (req, reply) => {
    const { fixtureId, name } = req.body ?? {};
    if (!fixtureId) return reply.code(400).send({ error: "fixtureId required" });
    const { code } = rooms.createRoom(Number(fixtureId), name ?? null);
    return { code };
  });

  app.post<{ Params: { code: string }; Body: { playerId: string } }>(
    "/api/rooms/:code/join",
    async (req, reply) => {
      const room = rooms.roomByCode(req.params.code);
      if (!room) return reply.code(404).send({ error: "room not found" });
      if (!req.body?.playerId) return reply.code(400).send({ error: "playerId required" });
      rooms.join(room.id, req.body.playerId);
      rooms.broadcast(room.id, { type: "member_joined" });
      return { roomId: room.id, fixtureId: room.fixture_id };
    },
  );

  app.get<{ Params: { code: string }; Querystring: { playerId?: string } }>(
    "/api/rooms/:code/state",
    async (req, reply) => {
      const room = rooms.roomByCode(req.params.code);
      if (!room) return reply.code(404).send({ error: "room not found" });
      return rooms.stateView(room.id, req.query.playerId);
    },
  );

  app.post<{ Params: { code: string }; Body: { playerId: string; result: number; scoreHome: number; scoreAway: number; confidence: number; hotTake?: string } }>(
    "/api/rooms/:code/thesis",
    async (req, reply) => {
      const room = rooms.roomByCode(req.params.code);
      if (!room) return reply.code(404).send({ error: "room not found" });
      const b = req.body ?? ({} as never);
      try {
        if (![0, 1, 2].includes(b.result)) throw new Error("result must be 0|1|2");
        if (![1, 2, 3].includes(b.confidence)) throw new Error("confidence must be 1|2|3");
        if (!(b.scoreHome >= 0 && b.scoreHome <= 9 && b.scoreAway >= 0 && b.scoreAway <= 9)) throw new Error("scores 0-9");
        const result = b.result as 0 | 1 | 2;
        if ((result === 0 && b.scoreHome <= b.scoreAway) || (result === 2 && b.scoreAway <= b.scoreHome) || (result === 1 && b.scoreHome !== b.scoreAway)) {
          throw new Error("scoreline must match the result pick");
        }
        rooms.sealThesis(room.id, b.playerId, {
          result, scoreHome: b.scoreHome, scoreAway: b.scoreAway,
          confidence: b.confidence as 1 | 2 | 3, hotTake: b.hotTake ?? "",
        });
        return { ok: true };
      } catch (err) {
        return reply.code(400).send({ error: String(err).slice(0, 160) });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { playerId: string; choice: number } }>(
    "/api/cards/:id/answer",
    async (req, reply) => {
      try {
        rooms.answerCard(req.params.id, req.body.playerId, Number(req.body.choice));
        return { ok: true };
      } catch (err) {
        return reply.code(400).send({ error: String(err).slice(0, 160) });
      }
    },
  );

  // ---- leaderboards -----------------------------------------------------------
  app.get("/api/nations", async () => {
    const rows = db.prepare(
      `SELECT COALESCE(adopted_nation, nation) AS nation, SUM(total_points) AS points,
              COUNT(*) AS fans, ROUND(AVG(total_points), 1) AS perFan
       FROM players WHERE is_bot = 0 GROUP BY COALESCE(adopted_nation, nation)
       ORDER BY points DESC LIMIT 32`,
    ).all();
    return { nations: rows };
  });

  // ---- SSE ---------------------------------------------------------------------
  app.get<{ Params: { code: string } }>("/api/rooms/:code/events", (req, reply) => {
    const room = rooms.roomByCode(req.params.code);
    if (!room) return reply.code(404).send({ error: "room not found" });
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    reply.raw.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    const heartbeat = setInterval(() => reply.raw.write(": keepalive\n\n"), 15_000);
    const unsubscribe = rooms.subscribe(room.id, { write: (c) => reply.raw.write(c) });
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get("/healthz", async () => ({ ok: true, fixtures: ingest.fixtures.size, health: ingest.tx.health() }));
}
