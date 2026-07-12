/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0a0e1a",
        panel: "#131a2e",
        edge: "#243050",
        kick: "#4ade80",
        flare: "#f59e0b",
        homeTeam: "#60a5fa",
        awayTeam: "#f87171",
      },
      keyframes: {
        pop: { "0%": { transform: "scale(0.8)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
        pulseFast: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
      },
      animation: {
        pop: "pop 0.25s ease-out",
        pulseFast: "pulseFast 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
