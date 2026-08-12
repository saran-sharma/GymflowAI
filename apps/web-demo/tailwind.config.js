/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Matte black surfaces. Neutrals carry a faint red bias so the ground
        // and the accent read as one family rather than grey + red.
        matte: {
          950: '#08080a', // page
          900: '#0e0e11', // raised
          850: '#141417', // card / chart surface
          800: '#1b1b1f', // input, hover
          750: '#232329',
          700: '#2c2c33', // border
          600: '#3a3a42',
        },
        brand: {
          DEFAULT: '#ef2b3c', // premium red
          soft: '#ff5b68',
          deep: '#c8102e',
          series: '#ef2b3c', // validated data-mark red on matte-850
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
      letterSpacing: {
        tightest: '-0.045em',
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,.05) inset, 0 20px 50px -30px rgba(0,0,0,1)',
        lift: '0 30px 70px -40px rgba(0,0,0,1), 0 2px 8px -4px rgba(0,0,0,.8)',
        redglow: '0 0 0 1px rgba(239,43,60,.3), 0 24px 60px -28px rgba(239,43,60,.55)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        blink: { '0%,80%,100%': { opacity: 0.25 }, '40%': { opacity: 1 } },
        pulsering: {
          '0%': { transform: 'scale(1)', opacity: 0.55 },
          '100%': { transform: 'scale(2.1)', opacity: 0 },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .4s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .35s ease-out both',
        blink: 'blink 1.2s infinite',
        pulsering: 'pulsering 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}
