"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flag, get, loadMe, NATIONS, post, saveMe } from "@/lib/api";

interface FixtureRow {
  fixtureId: number;
  home: string;
  away: string;
  startTime: number;
}

export default function Landing() {
  const router = useRouter();
  const me = typeof window !== "undefined" ? loadMe() : null;
  const [nickname, setNickname] = useState("");
  const [nation, setNation] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const saved = loadMe();
    if (saved) {
      setNickname(saved.nickname);
      setNation(saved.nation);
    }
    // TV-mode QR deep link: /?join=CODE
    const joinParam = new URLSearchParams(window.location.search).get("join");
    if (joinParam) setCode(joinParam.toUpperCase());
    get<{ fixtures: FixtureRow[] }>("/api/fixtures").then((d) => setFixtures(d.fixtures)).catch(() => {});
  }, []);

  async function ensurePlayer(): Promise<string> {
    const saved = loadMe();
    if (saved && saved.nickname === nickname && saved.nation === nation) return saved.playerId;
    if (!nickname.trim() || !nation) throw new Error("pick a name and a nation");
    const { playerId } = await post<{ playerId: string }>("/api/players", { nickname, nation });
    saveMe({ playerId, nickname, nation });
    return playerId;
  }

  async function joinByCode(roomCode: string) {
    setBusy(true);
    setErr(null);
    try {
      const playerId = await ensurePlayer();
      await post(`/api/rooms/${roomCode}/join`, { playerId });
      router.push(`/room/${roomCode.toUpperCase()}`);
    } catch (e) {
      setErr(String(e).replace("Error: ", ""));
      setBusy(false);
    }
  }

  async function createRoom(fixtureId: number) {
    setBusy(true);
    setErr(null);
    try {
      await ensurePlayer();
      const { code: newCode } = await post<{ code: string }>("/api/rooms", { fixtureId });
      await joinByCode(newCode);
    } catch (e) {
      setErr(String(e).replace("Error: ", ""));
      setBusy(false);
    }
  }

  return (
    <main className="pt-8">
      <h1 className="text-3xl font-black tracking-tight">
        Match<span className="text-kick">Room</span>
      </h1>
      <p className="mt-1 text-sm text-neutral-400">
        Pick your nation. Seal your thesis. Survive the match with your friends —
        refereed live by the TxLINE feed.
      </p>

      {/* Step 1: who are you */}
      <div className="panel mt-5 space-y-3">
        <input
          className="input"
          placeholder="Your name"
          value={nickname}
          maxLength={20}
          onChange={(e) => setNickname(e.target.value)}
        />
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Your nation</div>
          <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
            {NATIONS.map((n) => (
              <button
                key={n}
                onClick={() => setNation(n)}
                className={`rounded-lg border p-1.5 text-center text-xs transition ${
                  nation === n ? "border-kick bg-kick/10" : "border-edge"
                }`}
              >
                <div className="text-xl leading-none">{flag(n)}</div>
                <div className="mt-0.5 truncate text-[10px] text-neutral-300">{n}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: join or create */}
      <div className="panel mt-3 space-y-3">
        <div className="flex gap-2">
          <input
            className="input mono uppercase"
            placeholder="Room code"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn-kick shrink-0" disabled={busy || code.length < 4} onClick={() => joinByCode(code)}>
            Join
          </button>
        </div>

        {fixtures.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">…or start a room</div>
            <div className="space-y-1.5">
              {fixtures.slice(0, 5).map((f) => (
                <button
                  key={f.fixtureId}
                  disabled={busy}
                  onClick={() => createRoom(f.fixtureId)}
                  className="flex w-full items-center justify-between rounded-xl border border-edge p-3 text-left transition hover:border-kick"
                >
                  <span className="text-sm font-semibold">
                    {flag(f.home)} {f.home} <span className="text-neutral-500">vs</span> {f.away} {flag(f.away)}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {new Date(f.startTime).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <div className="text-sm text-red-400">{err}</div>}
      </div>

      {hydrated && me && (
        <p className="mt-3 text-center text-xs text-neutral-500">
          playing as {flag(me.nation)} {me.nickname}
        </p>
      )}
      <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-600">
        Points only — a game of skill among friends. Live scores, events and odds by TxLINE.
      </p>
    </main>
  );
}
