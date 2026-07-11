/** Pure match-state reducer over TxLINE score frames.
 *  Phase comes from StatusId (NOT GameState) and the clock is estimated from
 *  phase-transition anchors + frame timestamps — see txline-kit VERIFIED.md. */
import type { ScoreUpdate } from "@txline-kit/client";
import { isFinalised, PHASE } from "@txline-kit/constants";

export interface MatchEvent {
  kind: "goal" | "corner" | "yellow" | "red" | "var" | "var_outcome" | "phase" | "finalised";
  team?: 1 | 2;
  minute: number;
  detail?: string;
}

export interface MatchState {
  fixtureId: number;
  statusId: number | null;
  stats: Record<string, number>;
  /** estimated match minute (0-90+) */
  minute: number;
  h1AnchorTs: number | null;
  h2AnchorTs: number | null;
  lastFrameTs: number;
  finalised: boolean;
  finalSeq: number | null;
  kickoff: boolean;
  varPending: boolean;
}

export function initialMatchState(fixtureId: number): MatchState {
  return {
    fixtureId, statusId: null, stats: {}, minute: 0,
    h1AnchorTs: null, h2AnchorTs: null, lastFrameTs: 0,
    finalised: false, finalSeq: null, kickoff: false, varPending: false,
  };
}

const delta = (prev: Record<string, number>, next: Record<string, number>, key: number) =>
  (next[String(key)] ?? 0) - (prev[String(key)] ?? 0);

export function estimateMinute(s: MatchState, frameTs: number): number {
  if (s.statusId === PHASE.HT) return 45;
  if (s.h2AnchorTs !== null) return Math.min(45 + Math.floor((frameTs - s.h2AnchorTs) / 60_000), 100);
  if (s.h1AnchorTs !== null) return Math.min(Math.floor((frameTs - s.h1AnchorTs) / 60_000), 50);
  return 0;
}

/** Apply one frame; returns the new state + semantic events it produced. */
export function reduceMatch(s: MatchState, u: ScoreUpdate): { state: MatchState; events: MatchEvent[] } {
  const events: MatchEvent[] = [];
  const next: MatchState = { ...s, lastFrameTs: u.Ts };
  const stats = u.Stats ?? s.stats;

  const statusId = (u.StatusId as number) ?? s.statusId;
  if (statusId !== s.statusId && statusId != null) {
    next.statusId = statusId;
    if (statusId === PHASE.H1 && s.h1AnchorTs === null) {
      next.h1AnchorTs = u.Ts;
      next.kickoff = true;
    }
    if (statusId === PHASE.H2 && s.h2AnchorTs === null) next.h2AnchorTs = u.Ts;
    events.push({ kind: "phase", minute: estimateMinute(next, u.Ts), detail: String(statusId) });
  }
  next.minute = estimateMinute(next, u.Ts);

  // Stat deltas -> semantic events
  if (u.Stats) {
    for (const [key, kind] of [[1, "goal"], [2, "goal"], [7, "corner"], [8, "corner"], [3, "yellow"], [4, "yellow"], [5, "red"], [6, "red"]] as const) {
      const d = delta(s.stats, stats, key);
      if (d > 0) {
        events.push({ kind, team: key % 2 === 1 ? 1 : 2, minute: next.minute });
      }
    }
    next.stats = stats;
  }

  // VAR drama (Data payload booleans per the soccer feed schema)
  const data = u.Data as Record<string, unknown> | undefined;
  if (data?.["VAR"] === true && !s.varPending) {
    next.varPending = true;
    events.push({ kind: "var", minute: next.minute, detail: String(data["Type"] ?? "") });
  }
  if (s.varPending && typeof data?.["Outcome"] === "string" && ["Stands", "Overturned"].includes(data["Outcome"] as string)) {
    next.varPending = false;
    events.push({ kind: "var_outcome", minute: next.minute, detail: data["Outcome"] as string });
  }

  if (!s.finalised && isFinalised(u)) {
    next.finalised = true;
    next.finalSeq = u.Seq;
    next.stats = u.Stats ?? next.stats;
    events.push({ kind: "finalised", minute: next.minute });
  }

  return { state: next, events };
}

export const score = (s: MatchState) => ({ home: s.stats["1"] ?? 0, away: s.stats["2"] ?? 0 });
