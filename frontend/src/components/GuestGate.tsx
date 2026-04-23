import type { ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'

interface Props {
  children: ReactNode
  pageName: string
}

export default function GuestGate({ children, pageName }: Props) {
  const isGuest = !!localStorage.getItem('nova_guest_token')
  const guestName = localStorage.getItem('nova_guest_name') || 'Guest'

  if (!isGuest) return <>{children}</>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-2 h-2 rounded-full bg-nova-teal animate-pulse-slow" />
        <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Guest Access</span>
      </div>
      <h1 className="font-display text-3xl text-white tracking-wide">{pageName}</h1>
      <div className="nova-card border border-nova-gold/20 flex flex-col items-center justify-center py-20 gap-5">
        <div className="w-14 h-14 rounded-xl bg-nova-border flex items-center justify-center">
          <Lock size={24} className="text-nova-muted" />
        </div>
        <div className="text-center max-w-sm">
          <p className="text-white font-body font-semibold mb-2">Owner-Only Content</p>
          <p className="text-sm font-mono text-nova-muted leading-relaxed">
            Hey {guestName} — this section is reserved for the NOVA owner.
            Upgrade to a Pro subscription to unlock full production access.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-nova-gold/10 border border-nova-gold/20">
          <Sparkles size={14} className="text-nova-gold" />
          <span className="text-xs font-mono text-nova-gold">Pro access — coming soon</span>
        </div>
      </div>
    </div>
  )
}
