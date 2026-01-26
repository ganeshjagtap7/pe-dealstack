/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./vdr.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // PE OS Design System - Banker Blue theme
        'primary': '#003366',
        'primary-hover': '#002855',
        'primary-light': '#E6EEF5',
        'secondary': '#059669',
        'secondary-light': '#D1FAE5',
        'background-body': '#F8F9FA',
        'background-light': '#F8F9FA',
        'background-dark': '#101822',
        'surface-card': '#FFFFFF',
        'surface-light': '#FFFFFF',
        'surface-dark': '#1a2430',
        'border-subtle': '#E5E7EB',
        'border-light': '#E5E7EB',
        'border-dark': '#2d3748',
        'border-focus': '#CBD5E1',
        'text-main': '#111827',
        'text-secondary': '#4B5563',
        'text-muted': '#9CA3AF',
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
