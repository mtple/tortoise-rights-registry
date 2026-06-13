import type { Config } from "tailwindcss";

// Brand tokens replicated from the public Tortoise app CSS (colors are public brand, not proprietary):
// cream #cbbfb9 + purple #280274. App uses Inter.
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#cbbfb9",
        ink: "#280274", // brand purple
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
