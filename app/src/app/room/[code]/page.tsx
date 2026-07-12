"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { API, flag, get, loadMe, post, vibrate, type RoomState } from "@/lib/api";
import { MomentumBar, type Probs } from "@/components/MomentumBar";
import { ThesisComposer } from "@/components/ThesisComposer";
import { CardPanel, type LiveCard } from "@/components/CardPanel";
import { Leaderboard, ThesisStrip, Ticker, type TickerItem } from "@/components/RoomBits";
import { Reckoning } from "@/components/Reckoning";
import { WalletLink } from "@/components/WalletLink";

let tickerSeq = 0;

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const me = typeof window !== "undefined" ? loadMe() : null;

  const [state, setState] = useState<RoomState | null>(null);
  const [momentum, setMomentum] = useState<Probs | null>(null);
  const [goalFlash, setGoalFlash] = useState<{ from: Probs; to: Probs } | null>(null);
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [lastCardResult, setLastCardResult] = useState<{ question: string; correctLabel: string; youWereRight: boolean | null } | null>(null);
  const [composing, setComposing] = useState(false);
  const lastMomentum = useRef<Probs | null>(null);
  const cardsRef = useRef<Map<string, LiveCard>>(new Map());
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(() => {
    if (refetchTimer.current) return;
    refetchTimer.current = setTimeout(async () => {
      refetchTimer.current = null;
      try {
        const s = await get<RoomState>(`/api/rooms/${code}/state?playerId=${me?.playerId ?? ""}`);
        setState(s);
        if (s.momentum) {
          setMomentum(s.momentum);
          lastMomentum.current = s.momentum;
        }
        for (const c of s.openCards) cardsRef.current.set(c.id, c);
      } catch {
        /* transient */
      }
    }, 150);
  }, [code, me?.playerId]);

  const pushTicker = useCallback((icon: string, text: string, strong = false) => {
    setTicker((t) => [{ id: String(tickerSeq++), icon, text, strong }, ...t].slice(0, 40));
  }, []);

  // SSE: the room reacts to the pitch in real time.
  useEffect(() => {
    if (!me) {
      router.replace("/");
      return;
    }
    refetch();
    const es = new EventSource(`${API}/api/rooms/${code}/events`);
    es.onmessage = (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.data);
      } catch {
        return;
      }
      const type = msg.type as string;
      if (type === "momentum") {
        const p = msg.point as Probs & { ts: number };
        const next = { home: p.home, draw: p.draw, away: p.away };
        lastMomentum.current = next;
        setMomentum(next);
      } else if (type === "match_event") {
        const ev = msg.event as { kind: string; team?: number; minute: number; detail?: string };
        const s = msg.score as { home: number; away: number };
        if (ev.kind === "goal") {
          vibrate(80);
          const from = lastMomentum.current;
          pushTicker("⚽", `${ev.minute}' GOAL — ${s.home}-${s.away}`, true);
          if (from) setTimeout(() => {
            if (lastMomentum.current) setGoalFlash({ from, to: lastMomentum.current });
          }, 1500);
        } else if (ev.kind === "corner") pushTicker("🚩", `${ev.minute}' corner`);
        else if (ev.kind === "yellow") pushTicker("🟨", `${ev.minute}' booking`);
        else if (ev.kind === "red") pushTicker("🟥", `${ev.minute}' RED CARD`, true);
        else if (ev.kind === "var") pushTicker("📺", `${ev.minute}' VAR check…`, true);
        else if (ev.kind === "var_outcome") pushTicker("📺", `VAR: ${ev.detail}`, true);
        refetch();
      } else if (type === "card_open") {
        const c = msg.card as LiveCard;
        cardsRef.current.set(c.id, c);
        vibrate(40);
        refetch();
      } else if (type === "card_result") {
        const cardId = msg.cardId as string;
        const answerIndex = msg.answerIndex as number | null;
        const results = msg.results as Array<{ playerId: string; correct: boolean; points: number }>;
        const card = cardsRef.current.get(cardId);
        if (card && answerIndex !== null) {
          const mine = results.find((r) => r.playerId === me.playerId);
          setLastCardResult({
            question: card.question,
            correctLabel: card.options[answerIndex],
            youWereRight: mine ? mine.correct : null,
          });
          if (mine?.correct) vibrate(60);
        }
        refetch();
      } else if (type === "thesis_reveal") {
        pushTicker("✉️", "KICKOFF — theses revealed!", true);
        vibrate(100);
        refetch();
      } else if (type === "banter") {
        pushTicker(String(msg.emoji ?? "💬"), `${msg.name}: ${msg.line}`);
      } else if (type === "reckoning") {
        pushTicker("⚖️", "FULL TIME — the Reckoning", true);
        refetch();
      } else if (["verdict", "member_joined", "thesis_sealed", "answer_in"].includes(type)) {
        refetch();
      }
    };
    es.onerror = () => {
      /* EventSource auto-reconnects */
    };
    const poll = setInterval(refetch, 15_000); // safety net
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [code, me, refetch, pushTicker, router]);

  if (!me) return null;
  if (!state) return <main className="pt-10 text-center text-neutral-400">joining room…</main>;

  const { fixture, phase, score, minute } = state;
  const myThesis = state.members.find((m) => m.playerId === me.playerId)?.thesis ?? null;
  const activeCard = state.openCards.length > 0 ? state.openCards[state.openCards.length - 1] : null;
  const kickoffAt = fixture.startTime ? new Date(fixture.startTime) : null;

  return (
    <main className="space-y-3 pt-4">
      {/* header / scoreboard */}
      <div className="panel py-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">
            room <span className="mono font-bold text-neutral-300">{state.room.code}</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest">
            {phase === "pre" && <span className="text-neutral-400">{kickoffAt ? `kickoff ${kickoffAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "pre-match"}</span>}
            {phase === "live" && <span className="text-kick animate-pulseFast">● live {minute}&apos;</span>}
            {phase === "done" && <span className="text-flare">full time</span>}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-center gap-3 text-xl font-black">
          <span>{flag(fixture.home)} {fixture.home}</span>
          <motion.span key={`${score.home}-${score.away}`} initial={{ scale: 1.6, color: "#4ade80" }} animate={{ scale: 1, color: "#ffffff" }} className="mono">
            {score.home}–{score.away}
          </motion.span>
          <span>{fixture.away} {flag(fixture.away)}</span>
        </div>
      </div>

      <MomentumBar
        probs={phase === "pre" ? state.sentiment : momentum ?? state.momentum}
        mode={phase === "pre" ? "sentiment" : "market"}
        home={fixture.home}
        away={fixture.away}
        goalFlash={goalFlash}
      />

      {/* ACT 1: conviction */}
      {phase === "pre" && (myThesis && !composing ? (
        <div className="panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold">✉️ Thesis sealed</div>
              <div className="text-xs text-neutral-400">revealed to the room at kickoff</div>
            </div>
            <button className="btn-ghost text-xs" onClick={() => setComposing(true)}>edit</button>
          </div>
        </div>
      ) : (
        <ThesisComposer
          code={code}
          playerId={me.playerId}
          home={fixture.home}
          away={fixture.away}
          existing={myThesis}
          onSealed={() => { setComposing(false); refetch(); }}
        />
      ))}

      {/* ACT 2: reaction */}
      {phase === "live" && <CardPanel card={activeCard} playerId={me.playerId} lastResult={lastCardResult} />}

      {/* ACT 3: the reckoning */}
      {phase === "done" && <Reckoning members={state.members} final={score} home={fixture.home} away={fixture.away} />}

      <ThesisStrip members={state.members} phase={phase} home={fixture.home} away={fixture.away} />
      <Ticker items={ticker} />
      <Leaderboard members={state.members} meId={me.playerId} />

      <div className="flex items-center justify-between px-1">
        <WalletLink />
        <a className="text-[11px] text-neutral-500 underline" href={`/room/${code}/tv`} target="_blank">
          TV mode ↗
        </a>
      </div>
    </main>
  );
}
