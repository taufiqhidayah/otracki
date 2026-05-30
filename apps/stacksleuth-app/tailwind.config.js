module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#e9ebf0",
          200: "#cfd4df",
          300: "#aeb7ca",
          400: "#8692af",
          500: "#636f8c",
          600: "#4b5570",
          700: "#3a415a",
          800: "#2a2f43",
          900: "#181b29",
          950: "#0b0d14"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.55)"
      }
    }
  },
  plugins: []
};

