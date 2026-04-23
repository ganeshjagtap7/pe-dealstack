/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./js/**/*.js",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(0, 51, 102, 0.1)',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
