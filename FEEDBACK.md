# TxLINE API feedback (from building MatchRoom)

Consumer-app perspective (our Track 1 entry, ProofPlay, has a separate
protocol-side feedback file). What follows was hit while building a real-time
fan game on the devnet free tier, July 11–12, 2026.

## What we loved
1. **The Stats map on every score record** (`{"1":2,"2":0,"1007":3,...}`,
   cumulative, per period prefix) is a game designer's dream — our entire card
   resolution engine and thesis grader is just deltas and lookups over it.
   No event parsing gymnastics.
2. **De-margined `Pct` on StablePrice records.** Honest probabilities straight
   off the feed meant our momentum meter needed zero math and we could say
   "the market thinks" to consumers without a margin-removal caveat.
3. **In-play odds density is superb** — a 1X2 record every few seconds during
   a match made the momentum bar feel alive even before goals.
4. **Event detail booleans** (`Data.VAR`, `Goal`, `Corner`, `YellowCard`,
   penalty outcomes) let us build drama cards (our VAR "Stands or Overturned?"
   card resolved off a real VAR check in the recorded match).
5. The **historical endpoints** made our judge demo possible: we replay a real
   recorded match wire-compatibly, which is the only sane answer to "judging
   happens after the tournament ends."

## Friction
1. **Phase lives in `StatusId`, not `GameState`.** `GameState` stayed
   "scheduled" for an entire live match. Every consumer dev will trip on this;
   one doc line ("phase = StatusId: 1–19, 100 = finalised") saves an evening.
2. **No usable match clock.** `Clock {running, seconds}` exists in the schema
   but was never populated (0 of 1,116 updates). We estimate minutes from
   phase-transition frame timestamps, which works but wobbles around
   stoppage time. A populated clock would improve every in-play product.
3. **`/api/scores/historical` returns SSE-framed text** (`data: {...}`)
   where every sibling endpoint returns JSON. Our client sniffs and re-parses.
4. **Pre-match odds don't exist** on the free World Cup tier — snapshots
   return `[]` until kickoff. Fine once you know; surprising until then. We
   designed around it (pre-match shows room sentiment instead of the market),
   but an explicit "StablePrice coverage begins in-play" note would help.
5. **Corpus depth**: raw score history includes days of pre-match
   `coverage_update` frames before the actual match window — fine, but worth
   documenting so replay/demo builders know to seek to the first `StatusId=2`
   frame rather than frame zero.

## Wishlist
- Server-side stream filter by competition (we get every covered fixture and
  filter client-side).
- A `matchMinute` field on score records (even estimated).
- Player-level events (scorer identity) for richer consumer cards.
