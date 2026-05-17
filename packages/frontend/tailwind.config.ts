import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0907",
          900: "#111110",
          800: "#171715",
          700: "#1f1f1c",
          600: "#2a2a26",
        },
        gold: {
          50:  "#fdf7e6",
          100: "#fbebbf",
          200: "#f6d885",
          300: "#eebf4a",
          400: "#d9a221",
          500: "#b88216",
          600: "#8e6310",
        },
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
