/** Card engine: event-triggered cards preempt, clock-based backfill guarantees
 *  cadence. Resolution is a deterministic function of match/momentum state —
 *  the feed is the referee. All match-time windows use FRAME timestamps, so
 *  behavior is identical live and in accelerated replay. */
import type { MatchEvent, MatchState } from "./match.js";
import { score } from "./match.js";
import type { MomentumState } from "./momentum.js";
import { probAt } from "./momentum.js";

export interface CardSpec {
  type: string;
  question: string;
  options: string[];
  /** wall-clock ms the answer window stays open */
  answerWindowMs: number;
  meta: Record<string, number | string>;
}

export interface OpenCard extends CardSpec {
  id: string;
  openedWallTs: number;
  openedFrameTs: number;
}

export interface CardContext {
  match: MatchState;
  momentum: MomentumState;
  teams: { home: string; away: string };
  /** open cards for this room */
  open: OpenCard[];
  lastCardFrameTs: number;
}

const MIN = 60_000;
const snap = (s: MatchState, key: number) => s.stats[String(key)] ?? 0;

/** Cards to open in response to semantic events (priority order). */
export function cardsForEvents(ctx: CardContext, events: MatchEvent[]): CardSpec[] {
  const out: CardSpec[] = [];
  const { match, teams } = ctx;
  const has = (type: string) => ctx.open.some((c) => c.type === type);

  for (const ev of events) {
    if (ev.kind === "var" && !has("var")) {
      out.push({
        type: "var",
        question: `VAR is checking${ev.detail ? ` (${ev.detail})` : ""} — what's the call?`,
        options: ["Stands", "Overturned"],
        answerWindowMs: 20_000,
        meta: {},
      });
    }
    if (ev.kind === "phase" && ev.detail === "2" && !has("goal_window")) {
      out.push(goalWindowCard(match, 30, teams));
    }
    if (ev.kind === "phase" && ev.detail === "3" && !has("h2_line")) {
      out.push({
        type: "h2_line",
        question: "Second half: over or under 1.5 goals?",
        options: ["Over 1.5", "Under 1.5"],
        answerWindowMs: 60_000,
        meta: { baseH2Home: snap(match, 3001), baseH2Away: snap(match, 3002) },
      });
    }
    if (ev.kind === "phase" && ev.detail === "4" && !has("goal_window")) {
      out.push(goalWindowCard(match, 60, teams));
    }
    if (ev.kind === "corner" && !has("corner_race")) {
      out.push({
        type: "corner_race",
        question: `Corner ${teams.home} ${snap(match, 7)}–${snap(match, 8)} ${teams.away}. Who wins the NEXT corner?`,
        options: [teams.home, teams.away],
        answerWindowMs: 20_000,
        meta: { baseHome: snap(match, 7), baseAway: snap(match, 8) },
      });
    }
    if (ev.kind === "yellow" && !has("card_watch")) {
      out.push({
        type: "card_watch",
        question: "Another card shown before full time?",
        options: ["Yes", "No"],
        answerWindowMs: 20_000,
        meta: { base: snap(match, 3) + snap(match, 4) + snap(match, 5) + snap(match, 6) },
      });
    }
  }
  return out;
}

function goalWindowCard(match: MatchState, untilMinute: number, teams: { home: string; away: string }): CardSpec {
  return {
    type: "goal_window",
    question: `Goal before the ${untilMinute}th minute?`,
    options: ["Goal", "No goal"],
    answerWindowMs: 25_000,
    meta: { untilMinute, baseGoals: snap(match, 1) + snap(match, 2) },
  };
}

/** Clock-based backfill: guarantee a card at least every ~4 match-minutes. */
export function backfillCard(ctx: CardContext): CardSpec | null {
  const { match, momentum } = ctx;
  if (!match.kickoff || match.finalised || ctx.open.length > 0) return null;
  if (match.lastFrameTs - ctx.lastCardFrameTs < 4 * MIN) return null;
  const p = momentum.latest;
  if (p) {
    const targetMinute = Math.min(match.minute + 5, 89);
    return {
      type: "momentum_hilo",
      question: `Market check: home win chance is ${(p.home * 100).toFixed(0)}%. Higher or lower at the ${targetMinute}'?`,
      options: ["Higher", "Lower"],
      answerWindowMs: 20_000,
      meta: { baseProb: p.home, targetMinute },
    };
  }
  // No odds flowing (shouldn't happen in-play, but degrade gracefully):
  return goalWindowCard(match, Math.min(match.minute + 10, 90), ctx.teams);
}

export type Resolution = { answerIndex: number } | { void: true } | null;

/** Evaluate one open card against current state; null = still undecided. */
export function resolveCard(card: OpenCard, ctx: CardContext, events: MatchEvent[]): Resolution {
  const { match, momentum } = ctx;
  const m = card.meta;
  switch (card.type) {
    case "goal_window": {
      const goals = snap(match, 1) + snap(match, 2);
      if (goals > Number(m.baseGoals)) return { answerIndex: 0 };
      if (match.minute >= Number(m.untilMinute) || match.finalised) return { answerIndex: 1 };
      return null;
    }
    case "corner_race": {
      if (snap(match, 7) > Number(m.baseHome)) return { answerIndex: 0 };
      if (snap(match, 8) > Number(m.baseAway)) return { answerIndex: 1 };
      if (match.finalised) return { void: true }; // no further corners
      return null;
    }
    case "card_watch": {
      const total = snap(match, 3) + snap(match, 4) + snap(match, 5) + snap(match, 6);
      if (total > Number(m.base)) return { answerIndex: 0 };
      if (match.finalised) return { answerIndex: 1 };
      return null;
    }
    case "var": {
      const outcome = events.find((e) => e.kind === "var_outcome");
      if (outcome) return { answerIndex: outcome.detail === "Stands" ? 0 : 1 };
      if (match.finalised) return { void: true };
      return null;
    }
    case "h2_line": {
      const h2goals = snap(match, 3001) - Number(m.baseH2Home) + snap(match, 3002) - Number(m.baseH2Away);
      if (h2goals >= 2) return { answerIndex: 0 };
      if (match.finalised) return { answerIndex: 1 };
      return null;
    }
    case "momentum_hilo": {
      if (match.minute >= Number(m.targetMinute) || match.finalised) {
        const now = probAt(momentum, match.lastFrameTs);
        if (now == null) return { void: true };
        return { answerIndex: now > Number(m.baseProb) ? 0 : 1 };
      }
      return null;
    }
    default:
      return { void: true };
  }
}

export const CARD_POINTS = 50;
export const STREAK_MULTIPLIER_AT = 3;

export function cardPoints(streakBefore: number): number {
  return streakBefore + 1 >= STREAK_MULTIPLIER_AT ? CARD_POINTS * 2 : CARD_POINTS;
}

export { score };
