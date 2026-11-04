/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        corporate: {
          DEFAULT: '#004891',
          50: '#e6f0fa',
          100: '#cce1f5',
          200: '#99c3eb',
          300: '#66a5e1',
          400: '#3387d7',
          500: '#004891',
          600: '#003d7c',
          700: '#003163',
          800: '#00254b',
          900: '#001932',
          950: '#000c19',
        },
        gold: {
          DEFAULT: '#F9AA2E',
          50: '#fff9ed',
          100: '#fff3db',
          200: '#ffe6b8',
          300: '#ffd894',
          400: '#ffcb71',
          500: '#F9AA2E',
          600: '#e0941f',
          700: '#b87714',
          800: '#915c0e',
          900: '#754a0c',
          950: '#422804',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulseSubtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite alternate',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        pulseSubtle: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
        glowPulse: {
          '0%': { filter: 'drop-shadow(0 0 8px rgba(249, 170, 46, 0.3))' },
          '100%': { filter: 'drop-shadow(0 0 20px rgba(249, 170, 46, 0.8))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-gold': '0 8px 32px 0 rgba(249, 170, 46, 0.25), 0 0 15px rgba(249, 170, 46, 0.2)',
        'inner-glow': 'inset 0 0 15px rgba(255, 255, 255, 0.15)',
      },
    },
  },
  plugins: [],
};
