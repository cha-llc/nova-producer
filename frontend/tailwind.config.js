/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nova: {
          navy:    '#1A1A2E',
          navydark:'#0D0D1A',
          gold:    '#C9A84C',
          teal:    '#2A9D8F',
          crimson: '#C1121F',
          violet:  '#9B5DE5',
          surface: '#12121F',
          border:  '#2A2A40',
          muted:   '#6B6B8A',
        }
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body:    ['"Sora"', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in':    'fadeIn 0.4s ease forwards',
        'slide-up':   'slideUp 0.4s ease forwards',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      }
    }
  },
  plugins: []
}
