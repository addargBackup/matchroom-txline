/** MatchRoom game server.
 *  Live mode:   pnpm server            (streams devnet World Cup feeds)
 *  Judge mode:  pnpm demo              (replay of a recorded real match)
 */
import { writeSync } from "node:fs";

const boot = (msg: string) => { try { writeSync(2, `[boot] ${msg}\n`); } catch { /* ignore */ } };

process.on("uncaughtException", (err) => { boot(`uncaughtException: ${err?.stack ?? err}`); process.exit(1); });
process.on("unhandledRejection", (err) => { boot(`unhandledRejection: ${err}`); process.exit(1); });
boot("process alive");

const PORT = Number(process.env.PORT ?? 8790);

export async function startServer() {
  boot("startServer() called, importing fastify + cors");
  const { default: Fastify } = await import("fastify");
  const { default: cors } = await import("@fastify/cors");
  boot("fastify + cors imported, importing ingest");
  const { Ingest } = await import("./ingest.js");
  boot("ingest imported, importing rooms (pulls in db.js/better-sqlite3)");
  const { Rooms } = await import("./rooms.js");
  boot("rooms imported, importing routes");
  const { registerRoutes } = await import("./routes.js");
  boot("all modules imported, constructing Ingest");

  const ingest = new Ingest();
  boot("Ingest constructed, loading fixtures");
  await ingest.loadFixtures();
  boot("fixtures loaded, starting ingest");
  ingest.start();

  boot("ingest started, constructing Rooms");
  const rooms = new Rooms(ingest);
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  registerRoutes(app, ingest, rooms);
  boot(`routes registered, listening on :${PORT}`);
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[matchroom] server on :${PORT} (${process.env.REPLAY_BASE_URL ? "REPLAY " + process.env.REPLAY_BASE_URL : "devnet live"})`);
  return { app, ingest, rooms };
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) void startServer();
