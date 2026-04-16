/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        border: 'var(--border)',
        ember: 'var(--ember)',
        flame: 'var(--flame)',
        jade: 'var(--jade)',
        ice: 'var(--ice)',
        text: 'var(--text)',
        muted: 'var(--muted)',
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Cormorant Garamond', 'serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      maxWidth: {
        container: '1240px',
      },
    },
  },
  plugins: [],
};
