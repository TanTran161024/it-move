/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#080808',
        section: '#0F0F10',
        surface: '#171717',
        card: '#171717',
        cardHover: '#232323',
        primary: '#4F46E5', /* Indigo premium */
        secondary: '#2C2C2C',
        accent: '#4F46E5',
        text: {
          primary: '#FFFFFF',
          secondary: '#B5B5B5',
        },
        border: 'rgba(255,255,255,0.05)',
        divider: 'rgba(255,255,255,0.05)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      spacing: {
        'page-desktop': '72px',
        'page-laptop': '48px',
        'page-tablet': '32px',
        'page-mobile': '16px',
      },
      zIndex: {
        'navbar': '50',
        'hero': '20',
        'popup': '100',
        'overlay': '10',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        }
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
      }
    },
  },
  plugins: [],
}
