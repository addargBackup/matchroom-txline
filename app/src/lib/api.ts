"use client";

export const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8790";

// ---- identity (guest-first; wallet linking upgrades it) ----------------------
export interface Me {
  playerId: string;
  nickname: string;
  nation: string;
  wallet?: string;
}

export function loadMe(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("matchroom.me") ?? "null");
  } catch {
    return null;
  }
}
export function saveMe(me: Me) {
  localStorage.setItem("matchroom.me", JSON.stringify(me));
}

// ---- API helpers ---------------------------------------------------------------
export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}
export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ---- room state types (mirror of server RoomStateView) --------------------------
export interface ThesisView {
  sealed: true;
  revealed: boolean;
  result?: number;
  scoreHome?: number;
  scoreAway?: number;
  confidence?: number;
  hotTake?: string;
  health?: "alive" | "cooking" | "in_trouble" | "dead";
  points?: number;
  judas?: boolean;
  verdict?: string | null;
}
export interface MemberView {
  playerId: string;
  nickname: string;
  nation: string;
  adoptedNation: string | null;
  isBot: boolean;
  points: number;
  streak: number;
  thesis: ThesisView | null;
}
export interface RoomState {
  room: { id: string; code: string; fixtureId: number; name: string | null; isDemo: boolean };
  fixture: { home: string; away: string; startTime: number | null };
  phase: "pre" | "live" | "done";
  minute: number;
  score: { home: number; away: number };
  momentum: { home: number; draw: number; away: number } | null;
  sentiment: { home: number; draw: number; away: number } | null;
  members: MemberView[];
  openCards: Array<{ id: string; type: string; question: string; options: string[]; closesAt: number }>;
}

// ---- flags ----------------------------------------------------------------------
const FLAGS: Record<string, string> = {
  France: "🇫🇷", Morocco: "🇲🇦", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Norway: "🇳🇴", Spain: "🇪🇸", Argentina: "🇦🇷",
  Switzerland: "🇨🇭", Brazil: "🇧🇷", Japan: "🇯🇵", Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱",
  Belgium: "🇧🇪", Croatia: "🇭🇷", Italy: "🇮🇹", USA: "🇺🇸", Mexico: "🇲🇽", Canada: "🇨🇦",
  Uruguay: "🇺🇾", Colombia: "🇨🇴", Ecuador: "🇪🇨", Chile: "🇨🇱", Peru: "🇵🇪", Senegal: "🇸🇳",
  Ghana: "🇬🇭", Nigeria: "🇳🇬", Egypt: "🇪🇬", Algeria: "🇩🇿", Tunisia: "🇹🇳", Cameroon: "🇨🇲",
  "Ivory Coast": "🇨🇮", "South Africa": "🇿🇦", "Cape Verde": "🇨🇻", Japan2: "🇯🇵", Iran: "🇮🇷",
  "Saudi Arabia": "🇸🇦", Qatar: "🇶🇦", Jordan: "🇯🇴", Uzbekistan: "🇺🇿", Australia: "🇦🇺",
  "South Korea": "🇰🇷", "New Zealand": "🇳🇿", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", Austria: "🇦🇹",
  Denmark: "🇩🇰", Sweden: "🇸🇪", Poland: "🇵🇱", Ukraine: "🇺🇦", Turkey: "🇹🇷", Panama: "🇵🇦",
  "Costa Rica": "🇨🇷", Honduras: "🇭🇳", Jamaica: "🇯🇲", Paraguay: "🇵🇾", Bolivia: "🇧🇴",
  Venezuela: "🇻🇪", "Bosnia & Herzegovina": "🇧🇦", Serbia: "🇷🇸", Slovenia: "🇸🇮", Slovakia: "🇸🇰",
  Czechia: "🇨🇿", Romania: "🇷🇴", Hungary: "🇭🇺", Greece: "🇬🇷", Albania: "🇦🇱", Georgia: "🇬🇪",
};
export const flag = (nation: string | null | undefined): string => (nation && FLAGS[nation]) || "🏳️";
export const NATIONS = Object.keys(FLAGS).filter((n) => n !== "Japan2").sort();

export const RESULT_LABELS = (home: string, away: string) => [home, "Draw", away];

export const healthMeta: Record<string, { label: string; cls: string }> = {
  cooking: { label: "COOKING", cls: "text-kick animate-pulseFast" },
  alive: { label: "ALIVE", cls: "text-kick" },
  in_trouble: { label: "IN TROUBLE", cls: "text-flare" },
  dead: { label: "DEAD", cls: "text-red-400 line-through" },
};

export function vibrate(ms = 30) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
}
