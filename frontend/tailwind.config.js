/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#060606',
        section: '#0A0A0A',
        surface: '#121212',
        card: '#121212',
        cardHover: '#1A1A1A',
        primary: '#E50914',
        primaryHover: '#B80710',
        'primary-hover': '#B80710',
        secondary: '#27272A',
        accent: '#E50914',
        text: {
          primary: '#F8F8F8',
          secondary: '#A1A1AA',
        },
        border: 'rgba(255,255,255,0.08)',
        divider: 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 10px 30px -10px rgba(0, 0, 0, 0.8)',
        'glow': '0 0 20px -5px rgba(229, 9, 20, 0.4)',
      },
      dropShadow: {
        'glow': '0 0 18px rgba(229, 9, 20, 0.55)',
      },
      transitionTimingFunction: {
        'cinematic': 'cubic-bezier(0.25, 1, 0.5, 1)',
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
