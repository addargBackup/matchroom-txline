# MatchRoom

**Your group chat plays the World Cup match.** Pick your nation, seal your
thesis before kickoff, survive the match on quick-fire calls, face the
Reckoning at full time. Phones are the controllers, the TV is the scoreboard —
and the [TxLINE](https://txline.txodds.com) feed is the referee.

Points only — a game of skill among friends (Kahoot, not sportsbook).

## The three acts (mapped to TxLINE's coverage reality)

| Act | When | Powered by |
|---|---|---|
| **1 · Conviction** | pre-match | fixtures. Join with a link, rep your nation 🇫🇷, seal a thesis: result + exact scoreline + 1-3x confidence + a hot take the room will remember. Sealed envelopes ✉️ until kickoff. |
| **2 · Reaction** | in-play | scores + odds SSE streams. Quick-fire cards (goal windows, corner races, VAR verdicts, momentum hi-lo), a live market momentum bar (de-margined StablePrice), thesis health (ALIVE / COOKING / IN TROUBLE / DEAD), AI pundit banter. |
| **3 · The Reckoning** | full time | the final Stats map. Every thesis graded deterministically, receipts issued, pundit verdicts on hot takes, nation points awarded. |

## Features
- **Nation allegiance**: your flag rides on everything; a global nation
  leaderboard aggregates every fan's points; adopt a second nation when yours
  is eliminated; the **🗡️ Judas bonus** (+25) for correctly calling a result
  *against* your own nation.
- **Four AI pundits** in every room (Stats Nerd 🤓, The Homer 📣, Chaos
  Merchant 🃏, The Sharp 🕶️) — deterministic pick strategies; the LLM writes
  only their banter (canned fallbacks without an API key). A solo judge gets
  the full social experience.
- **TV mode** (`/room/CODE/tv`): broadcast board for the living-room screen —
  standings with flags, live market, active card, join QR. Jackbox model.
- **Sign-in with Solana**: guest-first onboarding (10 seconds to playing);
  wallet `signMessage` links your season profile. No transactions, ever.

## Scoring (deterministic — the LLM never touches points)

| Event | Points |
|---|---|
| Thesis: correct result | +100 × confidence |
| Thesis: exact scoreline | +150 × confidence (stacks) |
| Card: correct call | +50 |
| Card streak (3+) | ×2 |
| Judas bonus | +25 |
| Nation board | sum of members' points by allegiance |

## Judge runbook (zero matches required)

```bash
pnpm install
pnpm demo              # replay server + game server + seeded demo room
pnpm --dir app dev     # the app on http://localhost:3050
```

`pnpm demo` replays the committed corpus sample — **France vs Morocco, a real
recorded World Cup match** (scores + StablePrice odds fetched from TxLINE's
historical endpoints) — parked one minute before kickoff so you can seal a
thesis, then:

```bash
curl -X POST localhost:8788/control -d '{"action":"resume"}'   # kickoff!
curl -X POST localhost:8788/control -d '{"action":"speed","value":40}'
```

The four AI pundits are already in the room with sealed theses. Live mode
(during the tournament) is the same server without the replay:
`pnpm server` streams devnet World Cup feeds directly.

## Architecture
- `server/` — Fastify + SQLite. One TxLINE client (vendored
  [`txline-kit`](packages/txline-kit)) ingests the scores + odds SSE streams;
  pure reducers derive match state (phases via `StatusId`, minutes from
  phase-anchor frame timestamps), momentum (de-margined `Pct`), card
  resolutions and thesis grades; per-room SSE fans out to browsers. Card
  windows use FRAME timestamps, so live and accelerated replay behave
  identically. `REPLAY_BASE_URL` swaps the stream source — nothing else changes.
- `app/` — Next.js 14 PWA, mobile-first. Native EventSource; no wallet
  libraries (injected-provider `signMessage` only).

## TxLINE endpoints used
`/auth/guest/start` + `/api/token/activate` (on-chain devnet free tier),
`/api/fixtures/snapshot`, `/api/scores/stream`, `/api/odds/stream`,
`/api/scores/historical/{id}` + `/api/odds/updates/{day}/{hour}/{5min}`
(replay corpus). All access through the vendored txline-kit; no direct
fetches, no hardcoded stat keys or phase integers.

## Monetization path
Free rooms → premium season-long private leagues → nation-sponsor brand
moments (flags are ad-adjacent inventory) → shareable Reckoning receipts as
organic growth → white-label TV mode for pubs and creators.

## Status
- [x] Server: full three-act engine, verified end-to-end against the recorded
      real match (thesis reveal, 14 cards incl. a real VAR "Stands" at 25',
      353 momentum ticks, Reckoning with exact-score +750 and Judas +125)
- [x] App: landing (nation picker), room (all three acts), TV mode — verified
      in-browser against the replay
- [ ] TV-mode narrow-viewport polish; share-card image generation
- [ ] Deploy (server: any Node host; app: Vercel with NEXT_PUBLIC_API_BASE)
