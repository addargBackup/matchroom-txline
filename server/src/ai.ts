/** The four AI pundits. HARD RULE: deterministic strategies pick answers and
 *  theses — the LLM writes ONLY banter text (never touches points). Without an
 *  ANTHROPIC_API_KEY the bots fall back to canned lines, so judges get the
 *  full experience with zero setup. */
import type { OpenCard, CardContext } from "./engine/cards.js";
import type { MomentumState } from "./engine/momentum.js";

export interface Bot {
  key: string;
  name: string;
  emoji: string;
  /** which nation the bot reps for a given fixture */
  allegiance: (teams: { home: string; away: string }) => string;
  /** deterministic card answer */
  answer: (card: OpenCard, ctx: CardContext) => number;
  /** deterministic thesis */
  thesis: (teams: { home: string; away: string }, momentum: MomentumState) => {
    result: 0 | 1 | 2; scoreHome: number; scoreAway: number; confidence: 1 | 2 | 3; hotTake: string;
  };
  voice: string; // persona description for the LLM banter path
  canned: string[];
}

export const BOTS: Bot[] = [
  {
    key: "nerd",
    name: "The Stats Nerd",
    emoji: "🤓",
    allegiance: (t) => t.home, // reps whoever the data says (home advantage, naturally)
    answer: (card) => (card.type === "momentum_hilo" ? 0 : card.type === "goal_window" ? 1 : 0),
    thesis: (t, m) => {
      const p = m.latest;
      const homeFav = !p || p.home >= p.away;
      return {
        result: homeFav ? 0 : 2, scoreHome: homeFav ? 2 : 1, scoreAway: homeFav ? 1 : 2,
        confidence: 2, hotTake: "The expected-goals models are unanimous. I don't make the rules.",
      };
    },
    voice: "a smug statistics nerd who cites models and percentages, gently condescending",
    canned: ["The model saw that coming three minutes ago.", "Variance. It's always variance.", "Regression to the mean is undefeated."],
  },
  {
    key: "homer",
    name: "The Homer",
    emoji: "📣",
    allegiance: (t) => t.home,
    answer: (card) => 0, // always the optimistic first option
    thesis: (t) => ({
      result: 0, scoreHome: 3, scoreAway: 0, confidence: 3,
      hotTake: `${t.home} by three. Write it down. WRITE IT DOWN.`,
    }),
    voice: "an irrationally loyal superfan of the home team, all heart, zero analysis, lots of caps",
    canned: ["REFEREE!!", "Never in doubt. NEVER.", "That's character. That's DNA."],
  },
  {
    key: "chaos",
    name: "Chaos Merchant",
    emoji: "🃏",
    allegiance: (t) => t.away,
    answer: (card) => (card.options.length > 2 ? 2 : 1), // always the long shot
    thesis: (t) => ({
      result: 1, scoreHome: 2, scoreAway: 2, confidence: 3,
      hotTake: "2-2 with a red card and a missed penalty. Chaos is a ladder.",
    }),
    voice: "an agent of chaos who wants drama, upsets and VAR controversies, speaks in ominous aphorisms",
    canned: ["The chaos gods stir.", "Told you. Nobody listens.", "Order is an illusion. So is a two-goal lead."],
  },
  {
    key: "sharp",
    name: "The Sharp",
    emoji: "🕶️",
    allegiance: (t) => t.away,
    answer: (card, ctx) => {
      if (card.type === "momentum_hilo") {
        const h = ctx.momentum.history;
        if (h.length >= 2) return h[h.length - 1].home >= h[h.length - 2].home ? 0 : 1;
      }
      return 0;
    },
    thesis: (t, m) => {
      const p = m.latest;
      const edge = p ? p.home - p.away : 0;
      return {
        result: edge >= 0 ? 0 : 2, scoreHome: edge >= 0 ? 1 : 0, scoreAway: edge >= 0 ? 0 : 1,
        confidence: 1, hotTake: "Low-scoring. The value is always in the boring outcome.",
      };
    },
    voice: "a terse professional bettor who talks about value, closing lines and never celebrates",
    canned: ["Line moved. Noted.", "That's why you take the under.", "No emotion. Just price."],
  },
];

export function botAnswer(bot: Bot, card: OpenCard, ctx: CardContext): number {
  return Math.min(bot.answer(card, ctx), card.options.length - 1);
}

export function botThesis(bot: Bot, teams: { home: string; away: string }, momentum: MomentumState) {
  return bot.thesis(teams, momentum);
}

// ---------------------------------------------------------------------------
// LLM banter path (flavor ONLY). Falls back to canned lines without a key.
// ---------------------------------------------------------------------------
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.BANTER_MODEL ?? "claude-haiku-4-5";
let lastBanterAt = 0;

async function llm(prompt: string, maxTokens = 60): Promise<string | null> {
  if (!KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return data.content.find((c) => c.type === "text")?.text?.trim().slice(0, 200) ?? null;
  } catch {
    return null;
  }
}

/** One bot reacts to a match event (rate-limited to avoid banter spam). */
export async function botBanter(
  kind: string,
  ctx: CardContext,
): Promise<{ botKey: string; name: string; emoji: string; line: string } | null> {
  if (Date.now() - lastBanterAt < 8000) return null;
  lastBanterAt = Date.now();
  const bot = BOTS[Math.floor(Math.random() * BOTS.length)];
  const { home, away } = ctx.teams;
  const s = ctx.match.stats;
  const line =
    (await llm(
      `You are ${bot.name}, ${bot.voice}, in a World Cup watch-party group chat for ${home} vs ${away} ` +
        `(score ${s["1"] ?? 0}-${s["2"] ?? 0}, minute ${ctx.match.minute}). A "${kind}" event just happened. ` +
        `One punchy group-chat line (max 15 words). No hashtags, no quotes.`,
    )) ?? bot.canned[Math.floor(Math.random() * bot.canned.length)];
  return { botKey: bot.key, name: bot.name, emoji: bot.emoji, line };
}

/** Reckoning verdict on a player's hot take (banter only, never points). */
export async function verdictFor(hotTake: string, final: { home: number; away: number }, wasRight: boolean): Promise<string> {
  return (
    (await llm(
      `You are a witty football pundit grading a fan's pre-match hot take after the match ended ${final.home}-${final.away}. ` +
        `Their take: "${hotTake}". They were ${wasRight ? "RIGHT" : "WRONG"} about the result. ` +
        `One-line verdict, max 12 words, playful roast or grudging respect. No quotes.`,
    )) ?? (wasRight ? "Annoyingly, this take aged beautifully." : "This take did not survive contact with reality.")
  );
}
