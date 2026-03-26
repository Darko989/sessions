/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover:   'var(--color-accent-hover)',
          light:   'var(--color-accent-light)',
          muted:   'var(--color-accent-muted)',
          text:    'var(--color-accent-text)',
        },
        panel: {
          bg:      'var(--color-panel-bg)',
          sidebar: 'var(--color-panel-sidebar)',
          card:    'var(--color-panel-card)',
          border:  'var(--color-panel-border)',
          hover:   'var(--color-panel-hover)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          2: 'var(--color-ink-2)',
          3: 'var(--color-ink-3)',
          4: 'var(--color-ink-4)',
        },
        merged:  '#7c3aed',
        opened:  '#16a34a',
      },
    }
  },
  plugins: []
}
