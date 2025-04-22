import type { Config } from "tailwindcss";

export default {
  content: [],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#323232",
      gray: {
        100: "#f4f4f4",
        200: "#e6e6e6",
      },
      blue: {
        500: "#3968CD",
      },
    },
  },
  plugins: [],
} satisfies Config;
