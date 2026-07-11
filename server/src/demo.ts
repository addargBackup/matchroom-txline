/** ONE-COMMAND JUDGE DEMO: replay a real recorded World Cup match through the
 *  full three-act experience with the four AI pundits.
 *    pnpm demo   -> replay server + game server + seeded demo room
 *  Then open the app (pnpm --dir app dev) and join with the printed code.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { startReplayServer } from "@txline-kit/replay";

const corpusDir = process.env.CORPUS_DIR ?? path.resolve(process.cwd(), "corpus-sample");
const FIXTURE = Number(process.env.DEMO_FIXTURE ?? fs.readdirSync(corpusDir).find((d) => /^\d+$/.test(d)));
const REPLAY_PORT = 8788;
const SPEED = Number(process.env.DEMO_SPEED ?? 20);

// 1. Wire-compatible replay of the recorded match, paused pre-kickoff.
startReplayServer({ fixtureId: FIXTURE, corpusDir, speed: SPEED, port: REPLAY_PORT });
const control = (action: string, value?: number) =>
  fetch(`http://localhost:${REPLAY_PORT}/control`, { method: "POST", body: JSON.stringify({ action, value }) });

// Park the replay ~1 match-minute BEFORE the real kickoff frame and pause:
// Act 1 (theses) happens now; "resume" is the kickoff whistle. (Corpora carry
// days of pre-match coverage frames — never start from the first frame.)
const frames = fs.readFileSync(path.join(corpusDir, String(FIXTURE), "scores.jsonl"), "utf8").split("\n").filter(Boolean);
let kickoffTs = JSON.parse(frames[0]).ts;
for (const l of frames) {
  const f = JSON.parse(l);
  if (f.data.StatusId === 2) { kickoffTs = f.ts; break; }
}
await control("pause");
await control("seek", kickoffTs - 60_000);

// 2. Game server pointed at the replay.
process.env.REPLAY_BASE_URL = `http://localhost:${REPLAY_PORT}/api`;
const { rooms, ingest } = await (await import("./index.js")).startServer();

// 3. Demo room with the four AI pundits (theses pre-sealed).
await new Promise((r) => setTimeout(r, 500));
const { code } = rooms.createRoom(FIXTURE, "Judge Demo Room", true);
const room = rooms.roomByCode(code)!;
rooms.seedBots(room.id, FIXTURE);

const teams = ingest.teamsFor(FIXTURE);
console.log(`
════════════════════════════════════════════════════════
  MatchRoom judge demo — ${teams.home} vs ${teams.away} (real recorded match)
  Room code: ${code}
  1. Start the app:  pnpm --dir app dev   ->  http://localhost:3050
  2. Join with code ${code}, pick a nation, SEAL YOUR THESIS
  3. Press play to kick off:
       curl -X POST localhost:${REPLAY_PORT}/control -d '{"action":"resume"}'
     (replay runs at ${SPEED}x; control speed/seek via the same endpoint)
════════════════════════════════════════════════════════`);
