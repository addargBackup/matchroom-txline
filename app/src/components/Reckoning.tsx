"use client";
/** Act 3: the Reckoning — theses graded one by one, receipts issued. */
import { motion } from "framer-motion";
import { flag, type MemberView } from "@/lib/api";

export function Reckoning({
  members, final, home, away,
}: {
  members: MemberView[];
  final: { home: number; away: number };
  home: string;
  away: string;
}) {
  const graded = members
    .filter((m) => m.thesis?.revealed)
    .sort((a, b) => (b.thesis?.points ?? 0) - (a.thesis?.points ?? 0));

  return (
    <div className="panel border-flare/40">
      <div className="text-center">
        <div className="text-xs font-black uppercase tracking-widest text-flare">The Reckoning</div>
        <div className="mt-1 text-2xl font-black">
          {flag(home)} {final.home} – {final.away} {flag(away)}
        </div>
        <div className="text-[11px] text-neutral-500">full time · graded by the TxLINE feed, not by us</div>
      </div>

      <div className="mt-4 space-y-2">
        {graded.map((m, i) => {
          const t = m.thesis!;
          const right = (t.points ?? 0) > 0;
          return (
            <motion.div
              key={m.playerId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.35 }}
              className={`rounded-xl border p-3 ${right ? "border-kick/40 bg-kick/5" : "border-edge"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {flag(m.adoptedNation ?? m.nation)} {m.nickname}
                  {t.judas && <span className="ml-1" title="called it against their own nation">🗡️ Judas</span>}
                </span>
                <span className={`mono text-sm font-black ${right ? "text-kick" : "text-red-400"}`}>
                  {right ? `+${t.points}` : "0"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-400">
                called {t.scoreHome}–{t.scoreAway} at {t.confidence}x
                {right && t.scoreHome === final.home && t.scoreAway === final.away && (
                  <span className="ml-1 font-black text-kick">EXACT ✓</span>
                )}
              </div>
              {t.hotTake && <div className="mt-1 text-xs italic text-neutral-300">“{t.hotTake}”</div>}
              {t.verdict && <div className="mt-1 text-[11px] text-flare">🎙️ {t.verdict}</div>}
            </motion.div>
          );
        })}
      </div>

      <button
        className="btn-ghost mt-4 w-full text-xs"
        onClick={() => {
          const winner = graded[0];
          const text = `MatchRoom Reckoning — ${home} ${final.home}-${final.away} ${away}\n🏆 ${winner?.nickname} took the room.\nSeal your thesis next match.`;
          void navigator.share?.({ text }).catch(() => navigator.clipboard?.writeText(text));
        }}
      >
        Share the receipts 📸
      </button>
    </div>
  );
}
