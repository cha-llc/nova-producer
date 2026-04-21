import { NavLink } from 'react-router-dom'
import { Radio, FileText, Video, Settings, Sun, Brain, Mic, Camera, Send, BookOpen } from 'lucide-react'
import ChaNav from './ChaNav'
import GuestNav from './GuestNav'

const nav = [
  { to: '/',          label: 'Dashboard', short: 'Dash',    icon: Radio    },
  { to: '/scripts',   label: 'Scripts',   short: 'Scripts', icon: FileText },
  { to: '/episodes',  label: 'Episodes',  short: 'Eps',     icon: Video    },
  { to: '/scheduler', label: 'Scheduler', short: 'Sched',   icon: Send     },
  { to: '/studio',    label: 'Studio',    short: 'Studio',  icon: Brain    },
  { to: '/record',    label: 'Record',    short: 'Record',  icon: Camera   },
  { to: '/voice',     label: 'Voice',     short: 'Voice',   icon: Mic      },
  { to: '/sph',       label: 'SPH',       short: 'SPH',     icon: Sun      },
  { to: '/books',     label: 'Books',     short: 'Books',   icon: BookOpen },
  { to: '/settings',  label: 'Settings',  short: 'Config',  icon: Settings },
]

export default function NovaHeader() {
  const isGuest = !!localStorage.getItem('nova_guest_token')

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-nova-border bg-nova-navydark/90 backdrop-blur-sm">
      <div className="w-full px-3 flex items-center justify-between h-14 gap-2">
        {/* Logo — shrinks subtitle at smaller widths */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <div className="w-7 h-7 rounded-lg bg-nova-gold flex items-center justify-center">
              <span className="font-display text-nova-navy text-base leading-none">N</span>
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-nova-teal animate-pulse-slow" />
          </div>
          <div className="hidden lg:block">
            <span className="font-display text-white text-lg tracking-wider">NOVA</span>
            <span className="block text-[9px] font-mono text-nova-muted -mt-0.5 leading-tight">
              NETWORK OUTPUT &amp; VOICE AUTOMATOR
            </span>
          </div>
          <span className="lg:hidden font-display text-white text-lg tracking-wider">NOVA</span>
        </div>

        {/* Nav — scrollable fallback, icon-only below xl */}
        <nav className="flex items-center gap-px overflow-x-auto scrollbar-none flex-1 justify-center">
          {nav.map(({ to, label, short, icon: Icon }) => (
            <NavLink
              key={to} to={to} end={to === '/'}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-body transition-all duration-150 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-nova-gold/10 text-nova-gold'
                    : 'text-nova-muted hover:text-white hover:bg-nova-border/40'
                }`
              }
            >
              <Icon size={12} />
              {/* Full label ≥1280px, short label ≥1024px, icon-only below */}
              <span className="hidden xl:inline">{label}</span>
              <span className="hidden lg:inline xl:hidden">{short}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right side — app switcher + live indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {isGuest ? <GuestNav /> : <ChaNav current="nova" />}
          <div className="hidden xl:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-nova-teal animate-pulse-slow" />
            <span className="text-[10px] font-mono text-nova-muted">LIVE</span>
          </div>
        </div>
      </div>
    </header>
  )
}
