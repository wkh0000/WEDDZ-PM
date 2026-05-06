/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
      },
      backgroundImage: {
        'app-radial':
          'radial-gradient(circle at 0% 0%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(circle at 100% 100%, rgba(99,102,241,0.10), transparent 60%)',
        'grid-faint':
          'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)'
      },
      backgroundSize: {
        'grid-32': '32px 32px'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(99,102,241,0.25), 0 8px 32px -8px rgba(99,102,241,0.45)'
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: 0.5 },
          '50%':      { opacity: 1 }
        }
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
