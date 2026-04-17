/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'aegis-dark': '#020617', /* slate-950 */
        'aegis-card': 'rgba(255, 255, 255, 0.05)', /* lighter glass effect for fallback */
        'aegis-cyan': '#22d3ee', /* cyan-400 */
        'aegis-magenta': '#f43f5e', /* rose-500 */
        'aegis-green': '#10b981', /* emerald-500 */
        'aegis-yellow': '#f59e0b', /* amber-500 */
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'radial-gradient': 'radial-gradient(circle at 50% 50%, var(--tw-gradient-stops))',
      },
      keyframes: {
        slideDown: {
          '0%': { transform: 'translateY(-100%) translateX(-50%)', opacity: 0 },
          '100%': { transform: 'translateY(0) translateX(-50%)', opacity: 1 },
        },
        breathe: {
          '0%, 100%': { opacity: 0.8, transform: 'scale(1)' },
          '50%': { opacity: 1, transform: 'scale(1.02)' },
        }
      },
      animation: {
        'slideDown': 'slideDown 0.4s ease-out forwards',
        'breathe': 'breathe 2s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
