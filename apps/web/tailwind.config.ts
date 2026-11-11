import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), raised: v('raised'), line: v('line'), ink: v('ink'), muted: v('muted'), faint: v('faint'),
        brand: { DEFAULT: v('brand'), fg: v('brand-fg'), soft: v('brand-soft') },
        ok: v('ok'), warn: v('warn'), bad: v('bad'),
      },
      fontFamily: { sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)', pop: '0 12px 32px -8px rgb(0 0 0 / 0.25)' },
    },
  },
  plugins: [],
} satisfies Config;
