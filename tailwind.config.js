/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    // Override borderRadius at the root level (not extend) to fully replace defaults
    borderRadius: {
      none: "0px",
      sm: "1px",
      DEFAULT: "1px",
      md: "1px",
      lg: "1px",
      xl: "1px",
      "2xl": "1px",
      "3xl": "1px",
      full: "1px",
    },
    extend: {
      colors: {
        // New base color scheme - flat naming to work with @apply
        surface: {
          0: "#f3f3f3",      // Primary background
          1: "#ececec",      // Secondary background
          2: "#dbdbdb",      // Hover background
          3: "#c7c6c5",      // Border
        },
        ink: {
          0: "#232323",      // Primary text
          1: "#6a6a6a",      // Secondary text
          2: "#93908f",      // Muted/accent text
        },
        accent: {
          DEFAULT: "#ea5b26", // Interactive accent
          hover: "#d24714",   // Hover state
          muted: "#93908f",   // General accent
        },
        border: "#c7c6c5",
      },
      fontFamily: {
        sans: [
          "DM Sans",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        elevated: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
