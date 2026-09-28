/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#e6e6e6',
        card: '#141414',
        muted: '#161616',
        'muted-foreground': '#9a9a9a',
        'bnb-yellow': '#F0B90B'
      },
      boxShadow: {
        'brutal': '4px 4px 0 0 #e6e6e6',
        'brutal-sm': '2px 2px 0 0 #e6e6e6',
        'brutal-yellow': '4px 4px 0 0 #F0B90B',
        'brutal-yellow-sm': '2px 2px 0 0 #F0B90B'
      }
    },
  },
  plugins: [],
};
