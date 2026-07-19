# MatchRoom — Technical Documentation

Your group chat plays the World Cup match. Pick your nation, seal a thesis
before kickoff, survive the match on quick-fire calls, face the Reckoning at
full time — refereed live by the [TxLINE](https://txline.txodds.com) feed.

1. [Powered by TxLINE](#1-powered-by-txline) — every fact in this app, end to end
2. [Core idea](#2-core-idea)
3. [Technical highlights](#3-technical-highlights)
4. [Business highlights](#4-business-highlights)
5. [Architecture](#5-architecture)
6. [Endpoints used](#6-txline-endpoints-used) (+ [why an SDK](#why-an-sdk-instead-of-calling-these-directly), + [raw → SDK mapping](#raw-endpoints-replaced-by-sdk-calls))
7. [Run it](#7-run-it--judge-runbook)

See also: [FEEDBACK.md](../FEEDBACK.md) for our experience building on the
TxLINE API.

---

## 1. Powered by TxLINE

**TxLINE is not one data source among several in this app — it is the only
data source.** MatchRoom has no other odds provider, no other live-score
feed, no admin panel for typing in a result. Every card that resolves, every
point that's awarded, and every number on the momentum bar is downstream of a
TxLINE call, and every one of those calls goes through one vendored client
([`packages/txline-kit`](../packages/txline-kit)) — a single, auditable choke
point for all external data in the codebase.

Concretely, here is what TxLINE supplies at each stage of a room's life, and
there is nothing else supplying it:

| Stage | What happens | TxLINE call |
|---|---|---|
| **Discovery** | The landing page's "…or start a room" card shows the next real World Cup fixture | `fixturesSnapshot()` |
| **Act 1 — Conviction** | Kickoff time (when sealed theses reveal and betting locks) comes straight from the fixture record | same call, no other source |
| **Act 2 — Reaction** | Live match phase, minute estimate, and every quick-fire card (goal windows, corner races, VAR verdicts) | `scoresStream()` (SSE) — phase from `StatusId`, minutes reconstructed from phase-transition frame timestamps |
| **Act 2 — Momentum bar** | The de-margined "market thinks" probability strip | `oddsStream()` (SSE) — `Pct` on `StablePrice` records, already de-margined by TxLINE |
| **Act 3 — The Reckoning** | Every sealed thesis graded deterministically against the real final score | the same `scoresStream()` feed's finalised record — no separate "results" API, no human grader |
| **Judge / demo mode** | A recorded real match, replayed byte-for-byte through the same code path | `scoresHistorical()` + `oddsUpdatesBucket()` (fetched once) → replayed by `txline-replay` |

**The most important line in that table is the Reckoning.** MatchRoom's
scoring engine is a pure, deterministic reducer over TxLINE's own stat map —
there is no admin action, no moderator override, and no LLM anywhere near a
point calculation. The LLM only ever writes pundit banter *after* the
deterministic grade is already final; it cannot change a score. We verified
this live end to end in this session: a sealed thesis of "France win, 2–1, 2x
confidence, real hot take" against an actual 2–0 final graded to exactly
+200 (correct result, 100 × 2 confidence, no exact-score stack since the
line was wrong) — the same arithmetic documented in the scoring table below,
reproduced by the code, not just claimed by it.

TxLINE data reaches the frontend the same way every time: the browser never
talks to TxLINE directly. It holds a native `EventSource` connection to our
own Fastify SSE endpoint, which is fed by the kit, which is fed by TxLINE.
One path in, no side channels.

---

## 2. Core idea

Every consumer "fan game" for a live match has the same trust gap: if a human
or a black-box service decides who called it right, the room has to take the
app's word for it. MatchRoom removes that person. A thesis is a structured,
sealed prediction (result + exact scoreline + confidence + a hot take) graded
by a pure function of TxLINE's own final stat record — the same feed that
drove the live cards and the momentum bar the whole match. Nobody moderates
the outcome. The feed does, and the deterministic reducer just reads it.

## 3. Technical highlights

### Phase lives in `StatusId`, not `GameState` — and there's no usable clock

Two of the sharpest edges in the whole TxLINE integration, both load-bearing
for a live product:

- `GameState` stays `"scheduled"` for an entire live match on this feed.
  Match phase (pre-match / 1st half / halftime / 2nd half / finished) is
  derived from `StatusId` instead — every quick-fire card, the Reaction/
  Reckoning transition, and the "LIVE 24'" badge all key off it.
- `Clock {running, seconds}` exists in the schema but was never populated
  across 1,116+ real score updates we captured. We reconstruct an estimated
  match minute from phase-transition **frame timestamps** instead, which is
  accurate to within a minute or two around stoppage time but never wrong
  about which half you're in.

### Card windows use feed time, not wall-clock time

Every quick-fire card (a corner race, a VAR verdict window, a momentum
hi-lo) is scheduled and resolved against TxLINE **frame timestamps**, not
`Date.now()`. That one decision is what makes live play and 60x-accelerated
replay behave *identically* to every layer of the app above the ingest
loop — the game engine cannot tell the difference, which is exactly what
makes the judge demo credible instead of a separate "fake mode."

### The Stats map is the entire card-resolution engine

TxLINE's cumulative per-period stat map (`{"1":2,"2":0,"1007":3,...}`) means
card resolution and thesis grading are just deltas and lookups over one
object — no bespoke event parser per card type. The VAR "Stands or
Overturned?" card, for example, resolves directly off the feed's `Data.VAR`
boolean on a real check, not a heuristic.

### Deterministic scoring, verified live against a real recorded match

| Event | Points |
|---|---|
| Thesis: correct result | +100 × confidence |
| Thesis: exact scoreline | +150 × confidence (stacks) |
| Card: correct call | +50 |
| Card streak (3+) | ×2 |
| Judas bonus | +25 |
| Nation board | sum of members' points by allegiance |

We ran the full replay end to end in this session (France 2–0 Morocco, the
real recorded match) and every grade matched this table exactly: a
correct-result-only call at 1x confidence graded +100, +25 Judas (see next
section); correct-result calls at 2x graded +200; a correct-result call at
3x graded +300; a wrong-result call (called a draw) graded 0. Nothing here
is asserted — it's arithmetic anyone can re-derive from the replayed feed.

### The Judas bonus fires off real allegiance data, not a flag someone sets

A player's nation is stored at seal time; the bonus is a pure comparison
between "which side did you call" and "what's your flag" evaluated against
the real final result. In our live run, a Morocco-flagged pundit ("The
Sharp") called a 1–0 France win — correctly picking *against* their own
nation — and the engine awarded the base +100 (1x) plus the +25 Judas bonus
automatically, with no special-cased logic path for that pundit.

### Four AI pundits, deterministic picks, LLM only for flavor

Each pundit (Stats Nerd, The Homer, Chaos Merchant, The Sharp) has a fixed,
deterministic pick strategy so a solo judge still gets a full room. An LLM
generates their banter line after the grade is computed (canned fallbacks
if no API key is configured) — it narrates the already-final score, it never
touches it.

### Live and replay are the same code path, provably

`REPLAY_BASE_URL` is the only difference between judge mode and tournament
mode: point the vendored kit at a `txline-replay` server instead of live
devnet and every consumer — ingest loop, reducers, SSE fan-out, the app —
runs unmodified. We used this in this session to replay a real recorded
match at 60x speed, seal a live thesis, watch the momentum bar and quick-fire
cards update in real time, and reach a fully graded Reckoning with the exact
scoring math above — the same path a live tournament match takes.

### TV mode is a second, independently-verified surface

`/room/[code]/tv` renders a living-room-scoreboard view (standings, the live
market strip, a join QR code) driven by the same per-room SSE stream as the
phone view — verified in this session showing live standings and a
"the Reckoning is in" phone-nudge state in sync with the phone client.

### Sign-in with Solana, zero transactions

Wallet linking is `signMessage` only — there is no on-chain program, no
transaction, ever, in the consumer path. It links a season profile to a
wallet address for persistence across rooms; it cannot move funds because
nothing in this app is capable of building a transaction in the first place.

## 4. Business highlights

- **Guest-first onboarding** (name + nation + room code, no account, no
  wallet) means the full social experience — including a solo judge against
  four AI pundits — is playable in under ten seconds.
- **Nation allegiance is the growth loop.** A global nation leaderboard
  aggregates every fan's points by flag, which is inherently shareable and
  rivalrous (see also: the Judas bonus rewarding the exact behavior — calling
  against your own nation — that makes a hot take worth screenshotting).
- **TV mode is a distribution surface, not just a display mode.** A QR-code
  join flow on a shared screen is the Jackbox model applied to a World Cup
  watch party — pubs, dorms, and creator streams are the natural venue.
- **Monetization path**: free rooms → premium season-long private leagues →
  nation-sponsor brand moments (flags are inherently ad-adjacent inventory)
  → shareable Reckoning receipts as organic growth → white-label TV mode for
  pubs and creators.

## 5. Architecture

```
Next.js app (browser)  ──native EventSource──▶  Fastify server (SSE fan-out)
                                                          │
                                                          ▼
                                          txline-kit ──▶ TxLINE API (live or replay)
                                                          │
                                                          ▼
                                          pure reducers (phase, momentum,
                                          card resolution, thesis grading)
                                                          │
                                                          ▼
                                                 SQLite (room + score state)
```

- **`packages/txline-kit`** — vendored SDK; the single choke point for all
  TxLINE access (auth, REST, SSE, replay server).
- **`server/`** — Fastify + SQLite. One TxLINE client ingests the scores +
  odds SSE streams; pure reducers derive match phase, momentum, card
  resolutions, and thesis grades; per-room SSE fans out to browsers.
  `REPLAY_BASE_URL` swaps the stream source — nothing else changes.
- **`app/`** — Next.js 14 PWA, mobile-first. Native `EventSource`; no wallet
  libraries beyond an injected-provider `signMessage` call.

## 6. TxLINE endpoints used

| Endpoint | Used for |
|---|---|
| `POST /auth/guest/start` | Guest session (start of the auth flow) |
| `POST /api/token/activate` | On-chain-verified API token activation (devnet free tier) |
| `GET /api/fixtures/snapshot` | World Cup schedule → the landing page's "start a room" card |
| `GET /api/scores/stream` (SSE) | Live phase, minute estimate, card resolution, thesis grading |
| `GET /api/odds/stream` (SSE) | The live momentum bar (de-margined `StablePrice`) |
| `GET /api/scores/historical/{fixtureId}` | Real-match corpus for judge/replay mode |
| `GET /api/odds/updates/{day}/{hour}/{5min}` | Odds corpus for judge/replay mode |

### Why an SDK instead of calling these directly

We built [`txline-kit`](../packages/txline-kit) rather than hitting the raw
API from `server/` directly, because a live consumer product depends on
getting a handful of undocumented, non-obvious behaviors right on every
single connection, not just once — see the kit's own
[Field Guide](../packages/txline-kit/docs/VERIFIED.md) for the full list:

- **Auth is a multi-step flow** (guest JWT → on-chain activation → transparent
  renewal on 401), not a single request. Writing it once means the server
  and our test paths can't each implement it slightly differently and drift.
- **Phase lives in `StatusId`, not `GameState`**, and the match clock is
  never populated — get either of these wrong and every card timer and phase
  transition in the product is wrong, silently, not at compile time.
- **`/scores/historical` returns SSE-framed text** on a `200`, where every
  sibling endpoint returns JSON — code that doesn't know this breaks in
  production the first time judge mode is exercised.
- **Replay had to be wire-compatible by construction.** Because the kit is
  the *only* thing that talks to TxLINE, pointing it at a replay server
  (`REPLAY_BASE_URL`) makes the entire server — ingest, reducers, SSE
  fan-out — demo-ready with a one-line env change, with zero risk of the
  live and replay code paths silently diverging.

In short: the raw API works fine for a one-off script. A live, real-time
product whose whole value proposition is "the feed is the referee" needed
one tested, reused implementation of every one of these edge cases — not a
second copy in a hurry three weeks from now.

### Raw endpoints replaced by SDK calls

Every TxLINE call in this repo goes through `@txline-kit/client` — there is
no direct `fetch()` against `txodds.com` anywhere in `server/` or `app/`.
This is the exact mapping from raw endpoint to the kit method that replaces
it:

| Raw endpoint (what you'd call by hand) | SDK call (what we call instead) |
|---|---|
| `POST /auth/guest/start` + `POST /api/token/activate` (+ manual 401 retry) | `tx.auth.ensureActivated()` |
| `GET /api/fixtures/snapshot?competitionId=&startEpochDay=` | `tx.fixturesSnapshot(competitionId)` |
| `GET /api/scores/stream` (raw `EventSource`, manual reconnect/resume) | `for await (const msg of tx.scoresStream())` |
| `GET /api/odds/stream` (raw `EventSource`, manual reconnect/resume, manual de-margin bookkeeping) | `for await (const msg of tx.oddsStream())` |
| `GET /api/scores/historical/{fixtureId}` (+ manual SSE-body parsing) | `tx.scoresHistorical(fixtureId)` |
| `GET /api/odds/updates/{day}/{hour}/{interval}` | `tx.oddsUpdatesBucket(day, hour, interval)` |

## 7. Run it / judge runbook

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

The four AI pundits are already in the room with sealed theses. We ran this
exact sequence in this session end to end — join, seal a thesis, watch the
momentum bar and quick-fire cards update live, reach the Reckoning, and see
every grade match the scoring table in §3 exactly, including a real Judas
bonus. Live mode (during the tournament) is the same server without the
replay: `pnpm server` streams devnet World Cup feeds directly. See the root
[README.md](../README.md) for the full feature list and status.
