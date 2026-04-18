import { NavLink } from 'react-router-dom'
import { Radio, FileText, Video, Settings, Sun } from 'lucide-react'
import ChaNav from './ChaNav'

const nav = [
  { to: '/',         label: 'Dashboard', icon: Radio },
  { to: '/scripts',  label: 'Scripts',   icon: FileText },
  { to: '/episodes', label: 'Episodes',  icon: Video },
  { to: '/sph',      label: 'SPH',       icon: Sun },
  { to: '/settings', label: 'Settings',  icon: Settings },
]

export default function NovaHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-nova-border bg-nova-navydark/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-nova-gold flex items-center justify-center">
              <span className="font-display text-nova-navy text-lg leading-none">N</span>
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-nova-teal animate-pulse-slow" />
          </div>
          <div>
            <span className="font-display text-white text-xl tracking-wider">NOVA</span>
            <span className="hidden sm:block text-[10px] font-mono text-nova-muted -mt-1">
              NETWORK OUTPUT &amp; VOICE AUTOMATOR
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-body transition-all duration-150 ${
                  isActive
                    ? 'bg-nova-gold/10 text-nova-gold'
                    : 'text-nova-muted hover:text-white hover:bg-nova-border/40'
                }`
              }
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Cross-app nav + status pill */}
        <div className="flex items-center gap-3">
          <ChaNav current="nova" />
          <div className="hidden sm:flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-nova-teal animate-pulse-slow" />
            <span className="text-xs font-mono text-nova-muted">LIVE</span>
          </div>
        </div>
      </div>
    </header>
  )
}
