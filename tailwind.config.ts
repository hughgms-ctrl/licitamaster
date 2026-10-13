import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const cor = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        border: cor("border"),
        input: cor("input"),
        ring: cor("ring"),
        background: cor("background"),
        foreground: cor("foreground"),
        primary: { DEFAULT: cor("primary"), foreground: cor("primary-foreground") },
        secondary: { DEFAULT: cor("secondary"), foreground: cor("secondary-foreground") },
        destructive: { DEFAULT: cor("destructive"), foreground: cor("destructive-foreground") },
        success: { DEFAULT: cor("success"), foreground: cor("success-foreground") },
        warning: { DEFAULT: cor("warning"), foreground: cor("warning-foreground") },
        info: { DEFAULT: cor("info"), foreground: cor("info-foreground") },
        muted: { DEFAULT: cor("muted"), foreground: cor("muted-foreground") },
        accent: { DEFAULT: cor("accent"), foreground: cor("accent-foreground") },
        popover: { DEFAULT: cor("popover"), foreground: cor("popover-foreground") },
        card: { DEFAULT: cor("card"), foreground: cor("card-foreground") },
        sidebar: {
          DEFAULT: cor("sidebar-background"),
          foreground: cor("sidebar-foreground"),
          primary: cor("sidebar-primary"),
          "primary-foreground": cor("sidebar-primary-foreground"),
          accent: cor("sidebar-accent"),
          "accent-foreground": cor("sidebar-accent-foreground"),
          border: cor("sidebar-border"),
          ring: cor("sidebar-ring"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
