/** MatchRoom game server.
 *  Live mode:   pnpm server            (streams devnet World Cup feeds)
 *  Judge mode:  pnpm demo              (replay of a recorded real match)
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Ingest } from "./ingest.js";
import { Rooms } from "./rooms.js";
import { registerRoutes } from "./routes.js";

const PORT = Number(process.env.PORT ?? 8790);

export async function startServer() {
  const ingest = new Ingest();
  await ingest.loadFixtures();
  ingest.start();

  const rooms = new Rooms(ingest);
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  registerRoutes(app, ingest, rooms);
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[matchroom] server on :${PORT} (${process.env.REPLAY_BASE_URL ? "REPLAY " + process.env.REPLAY_BASE_URL : "devnet live"})`);
  return { app, ingest, rooms };
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) void startServer();
