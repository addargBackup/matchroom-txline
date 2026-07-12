"use client";
/** Leaderboard, thesis strip, and the event ticker. */
import { motion } from "framer-motion";
import { flag, healthMeta, type MemberView } from "@/lib/api";

export function Leaderboard({ members, meId }: { members: MemberView[]; meId: string }) {
  return (
    <div className="panel">
      <div className="mb-2 text-xs font-black uppercase tracking-widest text-neutral-400">Room table</div>
      <div className="space-y-1">
        {members.map((m, i) => (
          <motion.div layout key={m.playerId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${m.playerId === meId ? "bg-kick/10" : ""}`}>
            <span className="w-4 text-xs text-neutral-500">{i + 1}</span>
            <span className="text-lg leading-none">{flag(m.adoptedNation ?? m.nation)}</span>
            <span className="flex-1 truncate text-sm font-semibold">
              {m.nickname}
              {m.isBot && <span className="ml-1 text-[9px] uppercase text-neutral-500">ai</span>}
              {m.streak >= 3 && <span className="ml-1 text-xs">🔥{m.streak}</span>}
            </span>
            {m.thesis?.judas && <span title="Judas bonus" className="text-xs">🗡️</span>}
            <span className="mono text-sm font-bold text-kick">{m.points}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function ThesisStrip({ members, phase, home, away }: { members: MemberView[]; phase: string; home: string; away: string }) {
  const withThesis = members.filter((m) => m.thesis);
  if (withThesis.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {withThesis.map((m) => {
        const t = m.thesis!;
        return (
          <motion.div layout key={m.playerId} className="min-w-[7.5rem] shrink-0 rounded-xl border border-edge bg-panel p-2">
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <span>{flag(m.adoptedNation ?? m.nation)}</span>
              <span className="truncate">{m.nickname}</span>
            </div>
            {t.revealed ? (
              <>
                <div className="mt-0.5 text-sm font-black">
                  {t.scoreHome}–{t.scoreAway}
                  <span className="ml-1 text-[10px] text-flare">{t.confidence}x</span>
                </div>
                {phase === "live" && t.health && (
                  <div className={`text-[10px] font-black ${healthMeta[t.health].cls}`}>{healthMeta[t.health].label}</div>
                )}
                {phase === "done" && (
                  <div className={`text-[10px] font-black ${t.points ? "text-kick" : "text-red-400"}`}>
                    {t.points ? `+${t.points}` : "0"} {t.judas ? "🗡️" : ""}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-1 text-lg">✉️ <span className="text-[10px] text-neutral-500">sealed</span></div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export interface TickerItem {
  id: string;
  icon: string;
  text: string;
  strong?: boolean;
}

export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="panel max-h-44 space-y-1.5 overflow-y-auto">
      {items.map((it) => (
        <motion.div key={it.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className={`text-xs ${it.strong ? "font-bold text-neutral-100" : "text-neutral-400"}`}>
          <span className="mr-1">{it.icon}</span>
          {it.text}
        </motion.div>
      ))}
    </div>
  );
}
