import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: "#0f0e0c",
        iron: "#171411",
        "iron-light": "#2a241f",
        sand: "#b6a690",
        ash: "#ece1d2",
        rust: "#b85c2e",
        amber: "#d49a3a",
        red: "#ef4444",
        green: "#22c55e",
        steel: "#d7b070",
        "steel-dark": "#4f3216",
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "monospace"],
        sans: ['"IBM Plex Sans"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
