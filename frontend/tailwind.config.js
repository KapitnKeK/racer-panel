/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07080a', 900: '#0c0e12', 800: '#12151b', 700: '#191d25', 600: '#222733', 500: '#2e3544', 400: '#465065', 300: '#6b7690', 200: '#9aa4ba', 100: '#c9d0de' },
        accent: { DEFAULT: '#e10600', hi: '#ff2a1f', dim: '#7a0b08', soft: 'rgba(225,6,0,0.14)' },
        ok: '#2ecc71',
        warn: '#f5a524',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Inter Variable"', 'ui-sans-serif', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: { card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)' },
      keyframes: { pulseDot: { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.45, transform: 'scale(0.8)' } } },
      animation: { pulseDot: 'pulseDot 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
}
