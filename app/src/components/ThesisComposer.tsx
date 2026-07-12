"use client";
/** Act 1: seal your thesis. Locked at kickoff, revealed to the room at kickoff. */
import { useState } from "react";
import { flag, post, RESULT_LABELS } from "@/lib/api";

function Stepper({ v, set }: { v: number; set: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-ghost h-10 w-10 !p-0 text-lg" onClick={() => set(Math.max(0, v - 1))}>−</button>
      <span className="w-8 text-center text-2xl font-black">{v}</span>
      <button className="btn-ghost h-10 w-10 !p-0 text-lg" onClick={() => set(Math.min(9, v + 1))}>+</button>
    </div>
  );
}

export function ThesisComposer({
  code, playerId, home, away, existing, onSealed,
}: {
  code: string;
  playerId: string;
  home: string;
  away: string;
  existing: { result?: number; scoreHome?: number; scoreAway?: number; confidence?: number; hotTake?: string } | null;
  onSealed: () => void;
}) {
  const [result, setResult] = useState<number>(existing?.result ?? 0);
  const [sh, setSh] = useState<number>(existing?.scoreHome ?? (existing?.result === 2 ? 0 : 2));
  const [sa, setSa] = useState<number>(existing?.scoreAway ?? 1);
  const [conf, setConf] = useState<number>(existing?.confidence ?? 2);
  const [take, setTake] = useState<string>(existing?.hotTake ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const labels = RESULT_LABELS(home, away);
  const scoreValid =
    (result === 0 && sh > sa) || (result === 1 && sh === sa) || (result === 2 && sa > sh);

  return (
    <div className="panel space-y-4">
      <div>
        <div className="text-sm font-black uppercase tracking-wide text-kick">Seal your thesis</div>
        <div className="text-xs text-neutral-400">Locked and revealed to the room at kickoff. Graded at full time. Choose your words carefully.</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {labels.map((l, i) => (
          <button
            key={i}
            onClick={() => { setResult(i); if (i === 1) { setSa(sh); } else if (i === 0 && sh <= sa) { setSh(sa + 1); } else if (i === 2 && sa <= sh) { setSa(sh + 1); } }}
            className={`btn-ghost !px-2 text-xs ${result === i ? "!border-kick !bg-kick/10" : ""}`}
          >
            {i === 0 ? flag(home) : i === 2 ? flag(away) : "🤝"} {l}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-5">
        <Stepper v={sh} set={setSh} />
        <span className="text-xl text-neutral-500">:</span>
        <Stepper v={sa} set={setSa} />
      </div>
      {!scoreValid && <div className="text-center text-xs text-flare">scoreline must match your result pick</div>}

      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Confidence (multiplies your thesis points)</div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((c) => (
            <button key={c} onClick={() => setConf(c)} className={`btn-ghost text-xs ${conf === c ? "!border-kick !bg-kick/10" : ""}`}>
              {c}x {c === 3 ? "😤" : c === 2 ? "🙂" : "😶"}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="input h-16 resize-none text-sm"
        placeholder="Hot take (the room will remember this)…"
        maxLength={140}
        value={take}
        onChange={(e) => setTake(e.target.value)}
      />

      {err && <div className="text-xs text-red-400">{err}</div>}
      <button
        className="btn-kick w-full"
        disabled={busy || !scoreValid}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await post(`/api/rooms/${code}/thesis`, {
              playerId, result, scoreHome: sh, scoreAway: sa, confidence: conf, hotTake: take,
            });
            onSealed();
          } catch (e) {
            setErr(String(e).replace("Error: ", ""));
          } finally {
            setBusy(false);
          }
        }}
      >
        {existing ? "Re-seal thesis ✉️" : "Seal it ✉️"}
      </button>
    </div>
  );
}
