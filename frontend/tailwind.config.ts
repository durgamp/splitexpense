import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0FA37F',
          light: '#E6F7F3',
          dark: '#0A7A5F',
        },
        owed: '#22C55E',
        owes: '#EF4444',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
