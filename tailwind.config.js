/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        atelier: {
          bg: "#F9F8F6",
          fg: "#1A1A1A",
          muted: "#EBE5DE",
          subtle: "#6C6863",
          accent: "#D4AF37",
          inverse: "#FFFFFF",
        },
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        "atelier-image": "0 8px 32px rgba(0,0,0,0.12)",
        "atelier-card": "0 2px 8px rgba(0,0,0,0.02)",
        "atelier-card-hover": "0 8px 24px rgba(0,0,0,0.06)",
        "atelier-button": "0 4px 16px rgba(0,0,0,0.15)",
        "atelier-button-hover": "0 8px 24px rgba(0,0,0,0.25)",
      },
      transitionTimingFunction: {
        luxury: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
      maxWidth: {
        atelier: "1600px",
      },
      letterSpacing: {
        editorial: "0.28em",
        button: "0.2em",
      },
      animation: {
        pulseSoft: "pulseSoft 1.5s ease-out infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%": { opacity: "0.45" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0.45" },
        },
      },
    },
  },
  plugins: [],
};
