/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── 2026 semantic palette (CSS-variable driven for easy re-theming) ──
        // Swap the brand accent in one place: --accent in src/index.css
        bg:      'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised:  'rgb(var(--raised) / <alpha-value>)',
        ink:     'rgb(var(--ink) / <alpha-value>)',
        muted:   'rgb(var(--muted) / <alpha-value>)',
        faint:   'rgb(var(--faint) / <alpha-value>)',
        line:    'rgb(var(--line) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          ink:     'rgb(var(--accent-ink) / <alpha-value>)',
        },
        ok:     'rgb(var(--ok) / <alpha-value>)',
        warn:   'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',

        // ── Legacy tokens (kept so un-restyled screens render during transition) ──
        'primary-black': '#000000',
        'primary-red': '#dc2626',
        'primary-white': '#ffffff',
        'red-dark': '#b91c1c',
        'red-light': '#ef4444',
        'black-90': 'rgba(0, 0, 0, 0.9)',
        'black-75': 'rgba(0, 0, 0, 0.75)',
        'black-50': 'rgba(0, 0, 0, 0.5)',
        'black-25': 'rgba(0, 0, 0, 0.25)',
        'black-10': 'rgba(0, 0, 0, 0.1)',
        'red-10': 'rgba(220, 38, 38, 0.1)',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        'xxl': '48px',
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      minHeight: {
        'touch': '48px',
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        'dvh': '100dvh',
      },
      minWidth: {
        'touch': '48px',
      },
      maxWidth: {
        'app': '80rem',
      },
      screens: {
        'xs': '380px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'hero':    ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'title':   ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'section': ['1.25rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        'body':    ['1rem', { lineHeight: '1.6' }],
        'small':   ['0.875rem', { lineHeight: '1.5' }],
      },
      borderRadius: {
        'xl2': '1.125rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(16,16,20,0.05)',
        'soft':   '0 1px 2px 0 rgba(16,16,20,0.04), 0 6px 20px -6px rgba(16,16,20,0.08)',
        'card':   '0 1px 3px rgba(16,16,20,0.06), 0 10px 30px -12px rgba(16,16,20,0.12)',
        'pop':    '0 20px 50px -16px rgba(16,16,20,0.28)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.24s ease-out',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.22,1,0.36,1)',
        'scale-in': 'scale-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
}
