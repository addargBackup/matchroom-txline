"use client";
/** Sign-in with Solana (track eligibility): signMessage via the injected
 *  wallet provider (Phantom/Solflare). No transactions, ever. */
import { useState } from "react";
import { loadMe, post, saveMe } from "@/lib/api";

interface InjectedSolana {
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (msg: Uint8Array, enc: "utf8") => Promise<{ signature: Uint8Array }>;
  publicKey?: { toString(): string };
}

export function WalletLink() {
  const me = loadMe();
  const [state, setState] = useState<"idle" | "busy" | "done" | "none">(me?.wallet ? "done" : "idle");

  if (!me) return null;
  if (state === "done") {
    return <span className="text-[11px] text-kick">✓ profile saved on Solana{me.wallet ? ` · ${me.wallet.slice(0, 4)}…` : ""}</span>;
  }
  if (state === "none") return <span className="text-[11px] text-neutral-500">no Solana wallet found</span>;

  return (
    <button
      className="text-[11px] text-neutral-400 underline"
      disabled={state === "busy"}
      onClick={async () => {
        const provider = (window as unknown as { solana?: InjectedSolana }).solana;
        if (!provider?.signMessage) {
          setState("none");
          return;
        }
        setState("busy");
        try {
          const { publicKey } = await provider.connect();
          const message = `MatchRoom link: ${me.playerId} @ ${Date.now()}`;
          const { signature } = await provider.signMessage(new TextEncoder().encode(message), "utf8");
          await post("/api/players/link-wallet", {
            playerId: me.playerId,
            wallet: publicKey.toString(),
            signature: Array.from(signature),
            message,
          });
          saveMe({ ...me, wallet: publicKey.toString() });
          setState("done");
        } catch {
          setState("idle");
        }
      }}
    >
      {state === "busy" ? "check your wallet…" : "save season profile with Solana"}
    </button>
  );
}
