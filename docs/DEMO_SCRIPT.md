# MatchRoom — Demo Video Script (~3.5 min)

## Before you hit record

1. Get a fresh room: kill any old `pnpm demo` process, then run it again —
   this reseeds a brand new room code with the four AI pundits waiting and
   nobody's thesis sealed yet. Don't reuse an already-played-out room.
   ```bash
   pnpm demo              # note the new room code it prints
   pnpm --dir app dev     # http://localhost:3050 (skip if already running)
   ```
2. Open two tabs: the join page (`localhost:3050`), and the GitHub repo.
3. Optional: open `/room/CODE/tv` in a third tab/window if you want the TV
   mode beat — makes a nice "second screen" cut.
4. Zoom the browser to ~110% so text is readable on the recording.

---

## 0. Hook — landing page (10-15s)

> "This is MatchRoom — your group chat plays the World Cup match. Pick your nation, seal a prediction before kickoff, survive the match on quick-fire calls, and face the reckoning at full time. It's Jackbox for the World Cup — and the referee isn't me, it's the live TxLINE feed."

---

## 1. Join a room (15-20s)

Type a name, pick a nation, enter the room code, click Join.

> "I'll join with my name, pick Argentina as my nation — that flag rides on everything I do in this room — and drop in the room code. Zero signup, no wallet required, playing in about ten seconds."

---

## 2. Act 1 — Conviction: seal a thesis (35-45s)

Landing on the room. Point at the top score bar and the momentum strip.

> "This is Act One — Conviction. Kickoff hasn't happened yet. Up top you can see the match, and right below it, room sentiment: right now the room's split roughly three-to-one on France. That number isn't a poll — well, actually it partly is a poll, but the market strip underneath it is TxLINE's real de-margined odds, live."

Pick a result, adjust the scoreline, pick a confidence multiplier, type a hot take, click Seal it.

> "Now I seal my thesis: I'll call France, exact scoreline 2-1, at 2x confidence — that multiplier is a real bet, it doubles my points if I'm right and I can't change my mind after this. And a hot take, because the room will remember it: 'Morocco's keeper is having a nightmare, watch.' Sealed. Locked and hidden from everyone else until kickoff — including me seeing theirs."

Point at the four AI pundit cards, all marked "sealed."

> "Four AI pundits are already in the room — Stats Nerd, Homer, Chaos Merchant, Sharp — each with a fixed, deterministic pick strategy, so even a solo judge running this gets a full room."

---

## 3. Act 2 — Reaction: kickoff (35-45s)

Trigger the replay to resume (this can happen off-screen before the cut, or narrated live).

> "Kickoff. Now we're in Act Two — Reaction."

Point at the live score, the momentum bar moving, and a quick-fire card.

> "Everything here is live off the TxLINE scores and odds streams. The score updates, the momentum bar moves in real time as the market strip shifts, and every few minutes a quick-fire card drops — this one's a corner race. These aren't scripted; they're generated from real match events as they happen. I've also got a thesis-health indicator telling me whether my sealed prediction is still alive, cooking, in trouble, or dead, based on the actual live score against what I called."

---

## 4. Act 3 — The Reckoning (60-75s, the centerpiece)

Full time. Point at "THE RECKONING" header.

> "Full time. This is the Reckoning — and the tagline says it all: 'graded by the TxLINE feed, not by us.' Every sealed thesis in the room gets revealed and scored right now, deterministically, off the real final result."

Scroll through the reveals.

> "The Homer called France by three at 3x confidence — wrong on the scoreline, but right on the result, so that's 100 points times 3 confidence: 300 points, no human touched that number. My own thesis: France at 2x, correct result, +200. And here's the one I actually want you to see —"

Point at "The Sharp 🗡️ Judas."

> "The Sharp is flagged Morocco. They called a 1-0 France win — correctly predicting against their own nation. That's the Judas bonus: plus 25 points on top of the base score, for having the nerve to call it against your own flag. It's not a moderator adding bonus points — it's a comparison the engine runs automatically between your sealed nation and your sealed pick, checked against the real result."

Point at "Chaos Merchant" with 0 points and the banter line.

> "And Chaos Merchant called a 2-2 draw with a red card and a missed penalty — zero points, and the pundit banter even roasts them for it: 'this take did not survive contact with reality.' That banter is the only place an LLM touches this feature — it's writing a caption after the grade is already final, it never decides the grade."

Scroll to the room table / standings.

> "Final standings, sorted by points, right there — no admin ever entered a result anywhere in this flow."

---

## 5. TV mode (15-20s)

Cut to the `/room/CODE/tv` tab.

> "And this is TV mode — same room, same live data, built for a shared screen. Standings, the live market strip, and a QR code so anyone can join mid-match just by scanning it. Phones are the controllers, the TV is the scoreboard."

---

## 6. Code / docs flash (15-20s)

Cut to the GitHub repo, scroll to "Powered by TxLINE" in the docs.

> "Every card, every point, every line on that momentum bar traces back to one source — TxLINE — through our own open-source SDK, txline-kit. There's no separate 'results' API and no moderator panel anywhere in this codebase. If TxLINE says it happened, the room finds out. If it doesn't, nothing here can fake it."

---

## 7. Close (10s)

> "That's MatchRoom — your group chat, playing the match, refereed by the feed. Repo and docs linked below."

---

**Total runtime: ~3.5-4 minutes.** If running long, the safest cuts are: skip the thesis-health explanation in Act 2 (§3), and trim the Chaos Merchant beat in the Reckoning (§4) — the Judas bonus reveal is the one moment that has to land, it's the single clearest proof that grading is real and automatic, not staged.
