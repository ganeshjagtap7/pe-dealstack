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
        'primary': '#1269e2',
        'background-light': '#f6f7f8',
        'background-dark': '#101822',
        'surface-light': '#ffffff',
        'surface-dark': '#1a2430',
        'border-light': '#e2e8f0',
        'border-dark': '#2d3748',
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
