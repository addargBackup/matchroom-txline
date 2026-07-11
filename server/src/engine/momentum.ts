/** Momentum reducer over TxLINE StablePrice odds frames.
 *  Uses the de-margined Pct fields of the 1X2 full-match market. Odds only
 *  exist IN-PLAY (VERIFIED.md (d)) — pre-match the product shows room
 *  sentiment instead. */
import type { OddsPayload } from "@txline-kit/client";
import { pctToProbability } from "@txline-kit/constants";

export interface MomentumPoint {
  ts: number;
  home: number;
  draw: number;
  away: number;
}

export interface MomentumState {
  fixtureId: number;
  latest: MomentumPoint | null;
  /** ring buffer of recent points for hi-lo cards + sparkline */
  history: MomentumPoint[];
}

export function initialMomentum(fixtureId: number): MomentumState {
  return { fixtureId, latest: null, history: [] };
}

const is1x2FullTime = (o: OddsPayload) =>
  o.SuperOddsType === "1X2_PARTICIPANT_RESULT" && !o.MarketPeriod;

export function reduceMomentum(s: MomentumState, o: OddsPayload): MomentumState {
  if (!is1x2FullTime(o) || !o.PriceNames || !o.Pct) return s;
  const idx = (name: string) => o.PriceNames!.indexOf(name);
  const home = pctToProbability(o.Pct[idx("part1")] ?? "NA");
  const draw = pctToProbability(o.Pct[idx("draw")] ?? "NA");
  const away = pctToProbability(o.Pct[idx("part2")] ?? "NA");
  if (home == null || away == null) return s;
  const point: MomentumPoint = { ts: o.Ts, home, draw: draw ?? 0, away };
  const history = [...s.history.slice(-599), point];
  return { ...s, latest: point, history };
}

/** Latest home-win probability at-or-before a given frame timestamp. */
export function probAt(s: MomentumState, ts: number): number | null {
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (s.history[i].ts <= ts) return s.history[i].home;
  }
  return null;
}
