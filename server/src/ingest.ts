/** TxLINE ingest: ONE client for the whole server. REPLAY_BASE_URL swaps the
 *  stream source to a wire-compatible replay — nothing else changes. */
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import { Keypair } from "@solana/web3.js";
import { createTxlineClient, type Fixture, type TxlineClient } from "@txline-kit/client";
import { WORLD_CUP_COMPETITION_ID } from "@txline-kit/client";
import { initialMatchState, reduceMatch, type MatchEvent, type MatchState } from "./engine/match.js";
import { initialMomentum, reduceMomentum, type MomentumState } from "./engine/momentum.js";

export interface FixtureFeedEvent {
  fixtureId: number;
  match: MatchState;
  momentum: MomentumState;
  events: MatchEvent[];
  source: "scores" | "odds";
}

export class Ingest extends EventEmitter {
  readonly tx: TxlineClient;
  /** real-API client for fixture metadata even in replay mode */
  readonly api: TxlineClient;
  readonly matches = new Map<number, MatchState>();
  readonly momentum = new Map<number, MomentumState>();
  fixtures = new Map<number, Fixture>();
  private lastMomentumEmit = new Map<number, number>();

  constructor() {
    super();
    this.setMaxListeners(500);
    const replayBase = process.env.REPLAY_BASE_URL;
    const wallet = loadWalletMaybe();
    this.tx = replayBase
      ? createTxlineClient({ network: "replay", baseUrl: replayBase })
      : createTxlineClient({ network: "devnet", wallet });
    this.api = replayBase ? createTxlineClient({ network: "devnet", wallet }) : this.tx;
  }

  matchFor(fixtureId: number): MatchState {
    if (!this.matches.has(fixtureId)) this.matches.set(fixtureId, initialMatchState(fixtureId));
    return this.matches.get(fixtureId)!;
  }
  momentumFor(fixtureId: number): MomentumState {
    if (!this.momentum.has(fixtureId)) this.momentum.set(fixtureId, initialMomentum(fixtureId));
    return this.momentum.get(fixtureId)!;
  }

  async loadFixtures(): Promise<void> {
    try {
      await this.api.auth.ensureActivated();
      const today = Math.floor(Date.now() / 86_400_000);
      const [past, future] = await Promise.all([
        this.api.fixturesSnapshot(WORLD_CUP_COMPETITION_ID, today - 14),
        this.api.fixturesSnapshot(WORLD_CUP_COMPETITION_ID, today),
      ]);
      for (const f of [...past, ...future]) this.fixtures.set(f.FixtureId, f);
      console.log(`[ingest] fixtures loaded: ${this.fixtures.size}`);
    } catch (err) {
      console.error("[ingest] fixture load failed:", String(err).slice(0, 200));
    }
  }

  teamsFor(fixtureId: number): { home: string; away: string } {
    const f = this.fixtures.get(fixtureId);
    return { home: f?.Participant1 ?? "Home", away: f?.Participant2 ?? "Away" };
  }

  start(): void {
    void this.loopScores();
    void this.loopOdds();
  }

  private async loopScores(): Promise<void> {
    for (;;) {
      try {
        for await (const msg of this.tx.scoresStream()) {
          const u = msg.data;
          if (!u?.FixtureId) continue;
          const prev = this.matchFor(u.FixtureId);
          const { state, events } = reduceMatch(prev, u);
          this.matches.set(u.FixtureId, state);
          if (events.length > 0 || u.Stats) {
            this.emit("fixture", {
              fixtureId: u.FixtureId, match: state,
              momentum: this.momentumFor(u.FixtureId), events, source: "scores",
            } satisfies FixtureFeedEvent);
          }
        }
      } catch (err) {
        console.error("[ingest] scores loop error, retrying in 5s:", String(err).slice(0, 150));
      }
      await sleep(5000);
    }
  }

  private async loopOdds(): Promise<void> {
    for (;;) {
      try {
        for await (const msg of this.tx.oddsStream()) {
          const o = msg.data;
          if (!o?.FixtureId) continue;
          const next = reduceMomentum(this.momentumFor(o.FixtureId), o);
          this.momentum.set(o.FixtureId, next);
          // Throttle momentum broadcasts (replay at 30x can be a firehose).
          const last = this.lastMomentumEmit.get(o.FixtureId) ?? 0;
          if (next.latest && Date.now() - last > 400) {
            this.lastMomentumEmit.set(o.FixtureId, Date.now());
            this.emit("fixture", {
              fixtureId: o.FixtureId, match: this.matchFor(o.FixtureId),
              momentum: next, events: [], source: "odds",
            } satisfies FixtureFeedEvent);
          }
        }
      } catch (err) {
        console.error("[ingest] odds loop error, retrying in 5s:", String(err).slice(0, 150));
      }
      await sleep(5000);
    }
  }
}

function loadWalletMaybe(): Keypair | undefined {
  try {
    const p = process.env.ANCHOR_WALLET ?? new URL("../../../.keys/devnet-wallet.json", import.meta.url).pathname;
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  } catch {
    return undefined; // env-token auth (TXLINE_API_TOKEN) still works
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
