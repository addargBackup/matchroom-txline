"use client";
/** TV MODE: read-only broadcast board for the living room / pub screen.
 *  Phones are controllers; this is the shared scoreboard. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { API, flag, get, healthMeta, type RoomState } from "@/lib/api";
import type { Probs } from "@/components/MomentumBar";

export default function TvPage() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<RoomState | null>(null);
  const [momentum, setMomentum] = useState<Probs | null>(null);
  const [ticker, setTicker] = useState<string[]>([]);
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/?join=${code}` : "";
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    try {
      const s = await get<RoomState>(`/api/rooms/${code}/state`);
      setState(s);
      if (s.momentum) setMomentum(s.momentum);
    } catch { /* transient */ }
  }, [code]);

  useEffect(() => {
    void refetch();
    const es = new EventSource(`${API}/api/rooms/${code}/events`);
    es.onmessage = (raw) => {
      try {
        const msg = JSON.parse(raw.data);
        if (msg.type === "momentum") setMomentum(msg.point);
        else if (msg.type === "match_event") {
          const e = msg.event;
          const icon = { goal: "⚽", corner: "🚩", yellow: "🟨", red: "🟥", var: "📺", var_outcome: "📺" }[e.kind as string] ?? "•";
          setTicker((t) => [`${icon} ${e.minute}' ${e.kind.replace("_", " ")}${e.detail ? ` — ${e.detail}` : ""}`, ...t].slice(0, 6));
          void refetch();
        } else if (msg.type === "banter") {
          setTicker((t) => [`${msg.emoji} ${msg.name}: ${msg.line}`, ...t].slice(0, 6));
        } else if (["card_open", "card_result", "thesis_reveal", "reckoning", "member_joined"].includes(msg.type)) {
          void refetch();
        }
        seq.current++;
      } catch { /* skip */ }
    };
    const poll = setInterval(refetch, 15_000);
    return () => { es.close(); clearInterval(poll); };
  }, [code, refetch]);

  if (!state) return <div className="p-10 text-2xl text-neutral-400">MatchRoom TV…</div>;
  const { fixture, phase, score, minute } = state;
  const probs = phase === "pre" ? state.sentiment : momentum ?? state.momentum;
  const card = state.openCards.at(-1);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="fixed inset-0 mx-auto flex max-w-none flex-col gap-4 bg-night p-6 text-neutral-100">
      {/* scoreboard */}
      <div className="flex items-center justify-between">
        <div className="text-4xl font-black">
          {flag(fixture.home)} {fixture.home}
          <span className="mono mx-4 text-5xl text-kick">{score.home}–{score.away}</span>
          {fixture.away} {flag(fixture.away)}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold uppercase tracking-widest">
            {phase === "live" ? <span className="text-kick">● {minute}&apos;</span> : phase === "done" ? <span className="text-flare">FULL TIME</span> : "PRE-MATCH"}
          </div>
          <div className="text-xs text-neutral-500">MatchRoom · room {state.room.code}</div>
        </div>
      </div>

      {/* momentum */}
      {probs && (
        <div>
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span className="text-homeTeam">{pct(probs.home)}</span>
            <span className="text-neutral-500">{phase === "pre" ? "room sentiment" : "live market (TxLINE StablePrice)"}</span>
            <span className="text-awayTeam">{pct(probs.away)}</span>
          </div>
          <div className="flex h-5 overflow-hidden rounded-full bg-panel">
            <motion.div className="bg-homeTeam" animate={{ width: pct(probs.home) }} />
            <motion.div className="bg-neutral-600" animate={{ width: pct(probs.draw) }} />
            <motion.div className="bg-awayTeam" animate={{ width: pct(probs.away) }} />
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* leaderboard */}
        <div className="panel flex-1 overflow-y-auto">
          <div className="mb-2 text-sm font-black uppercase tracking-widest text-neutral-400">Standings</div>
          {state.members.map((m, i) => (
            <div key={m.playerId} className="flex items-center gap-3 border-b border-edge/40 py-2 text-xl">
              <span className="w-6 text-sm text-neutral-500">{i + 1}</span>
              <span>{flag(m.adoptedNation ?? m.nation)}</span>
              <span className="flex-1 font-bold">{m.nickname}{m.streak >= 3 ? " 🔥" : ""}{m.thesis?.judas ? " 🗡️" : ""}</span>
              {phase === "live" && m.thesis?.revealed && m.thesis.health && (
                <span className={`text-xs font-black ${healthMeta[m.thesis.health].cls}`}>{healthMeta[m.thesis.health].label}</span>
              )}
              {m.thesis && !m.thesis.revealed && <span className="text-sm">✉️</span>}
              <span className="mono text-2xl font-black text-kick">{m.points}</span>
            </div>
          ))}
        </div>

        <div className="flex w-96 flex-col gap-4">
          {/* active card */}
          <div className="panel">
            <div className="text-xs font-black uppercase tracking-widest text-kick">on your phones</div>
            {card ? (
              <>
                <div className="mt-2 text-xl font-bold">{card.question}</div>
                <div className="mt-2 flex gap-2 text-sm text-neutral-300">{card.options.join("  ·  ")}</div>
              </>
            ) : (
              <div className="mt-2 text-sm text-neutral-500">
                {phase === "pre" ? "theses are being sealed…" : phase === "done" ? "the Reckoning is in" : "next call soon"}
              </div>
            )}
          </div>
          {/* ticker */}
          <div className="panel flex-1 overflow-hidden">
            {ticker.map((t, i) => (
              <div key={i} className={`py-1 text-sm ${i === 0 ? "font-bold" : "text-neutral-400"}`}>{t}</div>
            ))}
          </div>
          {/* join QR */}
          <div className="panel flex items-center gap-3">
            <div className="rounded-lg bg-white p-1.5">
              <QRCodeSVG value={joinUrl} size={72} />
            </div>
            <div className="text-sm text-neutral-300">
              Join the room<br />
              <span className="mono text-lg font-black text-kick">{state.room.code}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
