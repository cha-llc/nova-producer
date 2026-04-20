import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { User, LogOut } from 'lucide-react'

const SB_URL = 'https://vzzzqsmqqaoilkmskadl.supabase.co'

export default function GuestNav() {
  const [showMenu, setShowMenu] = useState(false)
  const guestName = localStorage.getItem('nova_guest_name') || 'Guest'

  async function handleLogout() {
    const token = localStorage.getItem('nova_guest_token')
    if (!token) return

    const sessionStart = parseInt(localStorage.getItem('nova_guest_session_start') || '0')
    const sessionDuration = sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0

    try {
      await fetch(`${SB_URL}/functions/v1/nova-guest-logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ session_duration_seconds: sessionDuration }),
      })
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      localStorage.removeItem('nova_guest_token')
      localStorage.removeItem('nova_guest_id')
      localStorage.removeItem('nova_guest_name')
      localStorage.removeItem('nova_guest_session_start')
      window.location.href = '/login'
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-nova-border/30 transition-all"
      >
        <User size={16} className="text-nova-gold" />
        <span className="text-xs font-body text-white">{guestName}</span>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 bg-nova-navydark border border-nova-border/30 rounded-lg shadow-lg z-50">
          <NavLink
            to="/account"
            className="flex items-center gap-2 px-4 py-2 text-white hover:bg-nova-border/30 transition-all"
            onClick={() => setShowMenu(false)}
          >
            <User size={16} />
            Account Settings
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full text-left flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 transition-all border-t border-nova-border/30"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
