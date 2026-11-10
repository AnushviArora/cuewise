import type { Config } from "tailwindcss";

// Contrast notes (against bg #0a0b10):
//  ink #eef0f6 ≈ 17:1 · muted #a6abbd ≈ 8:1 · subtle #8a90a5 ≈ 5.6:1
//  accent #8b9bff ≈ 7.5:1 · edge #6b6f80 ≈ 3.7:1 (meets 3:1 for input borders)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0b10",
        ink: "#eef0f6",
        muted: "#a6abbd",
        subtle: "#8a90a5",
        edge: "#6b6f80",
        accent: { DEFAULT: "#8b9bff", soft: "#8b9bff22", on: "#0a0b10" },
        danger: "#ff9b9b",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 10px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        glow: "0 0 0 1px rgba(139,155,255,0.35), 0 8px 30px -8px rgba(139,155,255,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
