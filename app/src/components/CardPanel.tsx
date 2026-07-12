"use client";
/** Act 2: the active quick-fire card with a shrinking countdown. */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { post, vibrate } from "@/lib/api";

export interface LiveCard {
  id: string;
  type: string;
  question: string;
  options: string[];
  closesAt: number;
}

export function CardPanel({
  card, playerId, lastResult,
}: {
  card: LiveCard | null;
  playerId: string;
  lastResult: { question: string; correctLabel: string; youWereRight: boolean | null } | null;
}) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const remaining = card ? Math.max(0, card.closesAt - now) : 0;
  const total = 20_000;
  const myPick = card ? picked[card.id] : undefined;

  return (
    <AnimatePresence mode="wait">
      {card ? (
        <motion.div
          key={card.id}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          className="panel border-kick/50"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-kick">quick call</span>
            <span className={`mono text-xs ${remaining < 5000 ? "text-red-400" : "text-neutral-400"}`}>
              {(remaining / 1000).toFixed(0)}s
            </span>
          </div>
          <div className="mb-1 h-1 overflow-hidden rounded bg-night">
            <div className="h-full bg-kick transition-[width] duration-300" style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} />
          </div>
          <div className="py-2 text-base font-bold">{card.question}</div>
          <div className={`grid gap-2 ${card.options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {card.options.map((o, i) => (
              <button
                key={i}
                disabled={myPick !== undefined || remaining === 0}
                onClick={async () => {
                  setPicked((p) => ({ ...p, [card.id]: i }));
                  vibrate();
                  try {
                    await post(`/api/cards/${card.id}/answer`, { playerId, choice: i });
                  } catch {
                    /* window closed */
                  }
                }}
                className={`btn text-sm ${
                  myPick === i ? "bg-kick text-night" : "border border-edge text-neutral-100"
                } ${myPick !== undefined && myPick !== i ? "opacity-40" : ""}`}
              >
                {o}
              </button>
            ))}
          </div>
          {myPick !== undefined && <div className="mt-2 text-center text-xs text-neutral-400">locked in — the feed decides</div>}
        </motion.div>
      ) : lastResult ? (
        <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel py-3">
          <div className="text-xs text-neutral-400">{lastResult.question}</div>
          <div className="mt-1 text-sm font-bold">
            → {lastResult.correctLabel}{" "}
            {lastResult.youWereRight === true && <span className="text-kick">+points ✓</span>}
            {lastResult.youWereRight === false && <span className="text-red-400">missed</span>}
          </div>
        </motion.div>
      ) : (
        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel py-3 text-center text-xs text-neutral-500">
          eyes on the match — next call coming…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
