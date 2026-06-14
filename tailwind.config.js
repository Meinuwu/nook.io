/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "rgb(var(--bg-rgb) / <alpha-value>)",
        sage: "rgb(var(--accent-sage-rgb) / <alpha-value>)",
        wood: "rgb(var(--accent-wood-rgb) / <alpha-value>)",
        peach: "rgb(var(--accent-peach-rgb) / <alpha-value>)",
        rose: "#E8A0BF",
        sky: "#A8D8EA",
        amber: "#FFD89B",
        brown: "rgb(var(--text-rgb) / <alpha-value>)",
        olive: "rgb(var(--text-muted-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Nunito", "Quicksand", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        cozy: "var(--shadow-cozy)",
        "cozy-lg": "var(--shadow-cozy-lg)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(5deg)" },
        },
        shimmer: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
        "fade-out": "fade-out 0.5s ease-in both",
        bob: "bob 3s ease-in-out infinite",
        "pop-in": "pop-in 0.35s ease-out both",
        float: "float 4s ease-in-out infinite",
        "float-slow": "float 6s ease-in-out infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
      },
      backgroundSize: {
        shimmer: "200% 200%",
      },
    },
  },
  plugins: [],
};
