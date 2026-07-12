"use client";
/** Pre-match: room sentiment from sealed theses. In-play: live market
 *  probabilities from the TxLINE odds stream. Goal -> 4s freeze-frame. */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export interface Probs {
  home: number;
  draw: number;
  away: number;
}

export function MomentumBar({
  probs, mode, home, away, goalFlash,
}: {
  probs: Probs | null;
  mode: "sentiment" | "market";
  home: string;
  away: string;
  goalFlash: { from: Probs; to: Probs } | null;
}) {
  const [frozen, setFrozen] = useState<typeof goalFlash>(null);
  const lastFlash = useRef<typeof goalFlash>(null);

  useEffect(() => {
    if (goalFlash && goalFlash !== lastFlash.current) {
      lastFlash.current = goalFlash;
      setFrozen(goalFlash);
      const t = setTimeout(() => setFrozen(null), 4000);
      return () => clearTimeout(t);
    }
  }, [goalFlash]);

  if (!probs) {
    return (
      <div className="panel py-3 text-center text-xs text-neutral-500">
        {mode === "market" ? "waiting for the market…" : "seal a thesis to set the room's pulse"}
      </div>
    );
  }

  const p = frozen ? frozen.to : probs;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="panel py-3">
      <div className="mb-1 flex justify-between text-xs font-bold">
        <span className="text-homeTeam">{home} {pct(p.home)}</span>
        <span className="text-neutral-500">{mode === "market" ? "market" : "room"}{p.draw ? ` · draw ${pct(p.draw)}` : ""}</span>
        <span className="text-awayTeam">{pct(p.away)} {away}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-night">
        <motion.div className="bg-homeTeam" animate={{ width: pct(p.home) }} transition={{ type: "spring", damping: 20 }} />
        <motion.div className="bg-neutral-600" animate={{ width: pct(p.draw) }} transition={{ type: "spring", damping: 20 }} />
        <motion.div className="bg-awayTeam" animate={{ width: pct(p.away) }} transition={{ type: "spring", damping: 20 }} />
      </div>
      {frozen && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-center text-sm font-black text-kick">
          ⚽ {home} {Math.round(frozen.from.home * 100)}% → {Math.round(frozen.to.home * 100)}%
        </motion.div>
      )}
    </div>
  );
}
