/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#166534',   // dark green
          hover:   '#14532d',
          light:   '#f0fdf4',
          muted:   '#bbf7d0',
          text:    '#15803d',
        },
        panel: {
          bg:      '#f2ede8',
          sidebar: '#ffffff',
          card:    '#ffffff',
          border:  '#e5dfd8',
          hover:   '#f7f4f1',
        },
        ink: {
          DEFAULT: '#1c1917',
          2: '#57534e',
          3: '#a8a29e',
          4: '#d6d3d1',
        },
        merged:  '#7c3aed',   // purple for merged branches
        opened:  '#16a34a',   // green for open branches
      },
    }
  },
  plugins: []
}
