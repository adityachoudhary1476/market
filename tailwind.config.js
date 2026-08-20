/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep, warm near-black — primary dark surface / brand ink
        obsidian: {
          50: '#F6F5F2',
          100: '#E8E5DE',
          200: '#D2CDC2',
          300: '#B6B0A3',
          400: '#8E887C',
          500: '#6F6A60',
          600: '#57534B',
          700: '#151716', // Soft Black (raised dark surfaces)
          800: '#0F100F',
          900: '#0B0C0B', // Obsidian (deepest dark / primary ink)
          950: '#060706',
        },
        // Champagne / pale gold — accent
        gold: {
          50: '#FBF8F0',
          100: '#F5EFDE',
          200: '#E4D4AA', // Pale Gold
          300: '#D8C694',
          400: '#C9B27C', // Champagne Gold (accent base)
          500: '#B89E62',
          600: '#9C8348',
          700: '#7C6638',
          800: '#5E4E2B',
          900: '#40351E',
        },
        // Ivory — warm page background
        ivory: {
          50: '#FBFAF6',
          100: '#F3EFE6', // Ivory
          200: '#E9E2D3',
          300: '#DCD1BB',
          400: '#C8B99A',
        },
        // Stone — warm muted gray (secondary text, borders)
        stone: {
          50: '#F6F5F2',
          100: '#E9E6DF',
          200: '#D2CDC2',
          300: '#A7A398', // Stone (from palette)
          400: '#8C887E',
          500: '#706D65',
          600: '#58564F',
          700: '#44423D',
          800: '#2C2B28',
          900: '#1B1A18',
        },
        // Semantic — used sparingly for gains/losses only
        gain: {
          DEFAULT: '#3D7A52',
          soft: '#E6EEE8',
        },
        loss: {
          DEFAULT: '#A85043',
          soft: '#F3E5E2',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: [
          'Public Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'display-xl': ['clamp(2.5rem, 6vw, 4.5rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2rem, 4.5vw, 3.25rem)', { lineHeight: '1.06', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(1.6rem, 3vw, 2.25rem)', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
      },
      letterSpacing: {
        widest2: '0.18em',
      },
      borderRadius: {
        xl2: '1.1rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,12,11,0.04), 0 8px 24px -12px rgba(11,12,11,0.18)',
        card: '0 1px 0 rgba(11,12,11,0.04), 0 12px 32px -16px rgba(11,12,11,0.22)',
        glow: '0 0 0 1px rgba(201,178,124,0.22), 0 18px 48px -20px rgba(201,178,124,0.40)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'draw-line': {
          '0%': { strokeDashoffset: 'var(--len, 1000)' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        'marquee-slow': 'marquee 60s linear infinite',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'draw-line': 'draw-line 1.6s ease-out forwards',
      },
    },
  },
  plugins: [],
}
