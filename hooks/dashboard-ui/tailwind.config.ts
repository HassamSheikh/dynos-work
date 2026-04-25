import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "#090909",
        "bg-surface": "#111",
        "border-ui": "#1a1a1a",
        "text-accent": "#6ee7b7",
        "text-primary": "#e5e5e5",
        "text-muted": "#888",
      },
    },
  },
  plugins: [],
};

export default config;
