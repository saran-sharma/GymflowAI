export default function Logo({ className = '', size = 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const text = size === 'sm' ? 'text-base' : 'text-lg'
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`${box} grid place-items-center rounded-xl bg-accent/15 ring-1 ring-accent/40`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round">
          <path d="M5 9v6M19 9v6M5 12h14" />
        </svg>
      </span>
      <span className={`${text} font-bold tracking-tight text-white`}>
        GymFlow<span className="text-accent"> AI</span>
      </span>
    </span>
  )
}
