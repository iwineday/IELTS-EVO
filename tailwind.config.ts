import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "speaking-warm": "#f59e0b",
        "writing-plum": "#a855f7",
        "reading-jade": "#10b981",
        "listening-sea": "#3b82f6",
      },
      fontFamily: {
        display: ["ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config
