import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

/** Demo-only confirmation. Nothing is sent anywhere — there is no backend. */
export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 3200)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-5 z-[60] mx-auto flex max-w-md animate-fade-up items-start gap-3 rounded-xl border border-accent/30 bg-ink-900 px-4 py-3 shadow-glow sm:left-auto sm:right-6 sm:mx-0"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      <div className="flex-1">
        <p className="text-sm text-slate-100">{message}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Demo only — no message was actually sent.</p>
      </div>
      <button onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
