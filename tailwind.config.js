/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4A90E2', light: '#7BB0ED', dark: '#2D6FB8' },
        accent: '#FF6B6B',
      },
    },
  },
  plugins: [],
};
