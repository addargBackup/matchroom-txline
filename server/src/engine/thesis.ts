/** Thesis grading — a DETERMINISTIC rules engine over the final Stats map.
 *  The LLM never touches points; it only writes the banter verdict.
 *  Scoring table (published in README):
 *    correct result   +100 x confidence
 *    exact scoreline  +150 x confidence (bonus, stacks)
 *    Judas bonus      +25 (picked against your own nation and were right)
 */
export interface Thesis {
  result: 0 | 1 | 2; // home / draw / away
  scoreHome: number;
  scoreAway: number;
  confidence: 1 | 2 | 3;
}

export interface ThesisGrade {
  points: number;
  resultCorrect: boolean;
  exactScore: boolean;
  judas: boolean;
}

export function actualResult(home: number, away: number): 0 | 1 | 2 {
  return home > away ? 0 : home === away ? 1 : 2;
}

export function gradeThesis(
  t: Thesis,
  final: { home: number; away: number },
  opts: { playerNationSide: 0 | 2 | null }, // which side (if either) is the player's nation
): ThesisGrade {
  const result = actualResult(final.home, final.away);
  const resultCorrect = t.result === result;
  const exactScore = resultCorrect && t.scoreHome === final.home && t.scoreAway === final.away;
  let points = 0;
  if (resultCorrect) points += 100 * t.confidence;
  if (exactScore) points += 150 * t.confidence;
  // Judas: your nation played, you picked strictly the OTHER side to win, and you were right.
  const judas =
    resultCorrect &&
    opts.playerNationSide !== null &&
    ((opts.playerNationSide === 0 && t.result === 2) || (opts.playerNationSide === 2 && t.result === 0));
  if (judas) points += 25;
  return { points, resultCorrect, exactScore, judas };
}

/** In-play thesis health — the ambient emotional hook. Pure function. */
export type ThesisHealth = "alive" | "cooking" | "in_trouble" | "dead";
export function thesisHealth(
  t: Thesis,
  live: { home: number; away: number },
  minute: number,
  finalised: boolean,
): ThesisHealth {
  const result = actualResult(live.home, live.away);
  const exactNow = t.scoreHome === live.home && t.scoreAway === live.away;
  if (finalised) return t.result === result ? (exactNow ? "cooking" : "alive") : "dead";
  if (exactNow && t.result === result) return "cooking";
  if (t.result === result) return "alive";
  // Wrong right now: dead only if unreachable-ish (goals needed > plausible in time left)
  const goalsNeeded =
    t.result === 0 ? Math.max(0, live.away - live.home + 1)
    : t.result === 2 ? Math.max(0, live.home - live.away + 1)
    : Math.abs(live.home - live.away);
  const minutesLeft = Math.max(0, 90 - minute);
  return goalsNeeded > Math.ceil(minutesLeft / 15) ? "dead" : "in_trouble";
}
