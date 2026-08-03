/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — dark theme is the design, not a flip of a light one.
        ink: {
          950: '#0a0f0c', // page
          900: '#0e1512', // raised surface
          850: '#111a15', // chart surface (validated against series green)
          800: '#16211b', // hover / input
          700: '#1e2b24', // borders
          600: '#2a3a31',
        },
        // Brand green. `accent` is the UI green; `series` is the validated
        // data-mark green (passes lightness band + 3:1 on the chart surface).
        accent: {
          DEFAULT: '#22c55e',
          soft: '#4ade80',
          deep: '#16a34a',
          series: '#16a34a',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.4), 0 12px 32px -18px rgba(0,0,0,.9)',
        glow: '0 0 0 1px rgba(34,197,94,.25), 0 18px 50px -20px rgba(34,197,94,.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        blink: {
          '0%, 80%, 100%': { opacity: 0.25 },
          '40%': { opacity: 1 },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        blink: 'blink 1.2s infinite',
      },
    },
  },
  plugins: [],
}
