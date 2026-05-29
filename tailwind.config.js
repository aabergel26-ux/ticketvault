/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          ticketmaster: '#026CDF',
          axs: '#E31837',
          dice: '#FFD600',
          stubhub: '#770FDF',
        },
      },
    },
  },
  plugins: [],
}
