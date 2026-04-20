import { useState, useEffect } from 'react'
import { LogOut, Clock, CheckCircle, AlertCircle, CreditCard } from 'lucide-react'

const SB_URL = 'https://vzzzqsmqqaoilkmskadl.supabase.co'

interface TrialInfo {
  is_active: boolean
  is_expired: boolean
  days_remaining: number
  ends_at: string
  started_at: string
}

interface AccountStatus {
  guest_name: string
  email: string
  subscription_status: string
  trial_info: TrialInfo
  subscription_renews_at: string | null
}

export default function AccountSettings() {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    checkTrialStatus()
  }, [])

  async function checkTrialStatus() {
    const token = localStorage.getItem('nova_guest_token')
    if (!token) {
      setError('Not authenticated')
      return
    }

    try {
      const res = await fetch(`${SB_URL}/functions/v1/nova-guest-check-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to check status')
        return
      }

      setStatus(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    const token = localStorage.getItem('nova_guest_token')
    if (!token) return

    setLoggingOut(true)

    try {
      const sessionStart = parseInt(localStorage.getItem('nova_guest_session_start') || '0')
      const sessionDuration = sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0

      const res = await fetch(`${SB_URL}/functions/v1/nova-guest-logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ session_duration_seconds: sessionDuration }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Logout failed')
        return
      }

      localStorage.removeItem('nova_guest_token')
      localStorage.removeItem('nova_guest_id')
      localStorage.removeItem('nova_guest_name')
      localStorage.removeItem('nova_guest_session_start')

      window.location.href = '/login'
    } catch (e) {
      setError(String(e))
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleUpgradeToPro() {
    const token = localStorage.getItem('nova_guest_token')
    if (!token) return

    try {
      const res = await fetch(`${SB_URL}/functions/v1/nova-guest-create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          return_url: window.location.href,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create checkout')
        return
      }

      window.location.href = data.checkout_url
    } catch (e) {
      setError(String(e))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!status) {
    return (
      <div className="p-8">
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-400">{error || 'Failed to load account'}</p>
        </div>
      </div>
    )
  }

  const isTrialExpired = status.subscription_status === 'trial' && status.trial_info.is_expired
  const isProActive = status.subscription_status === 'active'

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-display text-white mb-8">Account Settings</h1>

      {/* Account Info */}
      <div className="bg-[#0D0D1A] border border-[#2A2A40]/30 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-body font-medium text-white mb-4">Account Information</h2>
        <div className="space-y-3">
          <div>
            <p className="text-[#6B6B8A] text-xs font-mono">NAME</p>
            <p className="text-white">{status.guest_name}</p>
          </div>
          <div>
            <p className="text-[#6B6B8A] text-xs font-mono">EMAIL</p>
            <p className="text-white">{status.email}</p>
          </div>
        </div>
      </div>

      {/* Trial / Subscription Status */}
      {status.subscription_status === 'trial' && !isTrialExpired && (
        <div className="bg-[#0D0D1A] border border-[#C9A84C]/30 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <Clock size={24} className="text-[#C9A84C] flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-body font-medium text-white mb-2">Free Trial Active</h3>
              <p className="text-[#6B6B8A] text-sm mb-4">
                {status.trial_info.days_remaining} days remaining. Trial ends on{' '}
                {new Date(status.trial_info.ends_at).toLocaleDateString()}
              </p>
              <button
                onClick={handleUpgradeToPro}
                className="px-4 py-2 bg-[#C9A84C] hover:bg-[#B8975F] text-[#1A1A2E] font-body font-medium rounded-lg transition-all"
              >
                Upgrade to Pro ($20/month)
              </button>
            </div>
          </div>
        </div>
      )}

      {isTrialExpired && !isProActive && (
        <div className="bg-[#0D0D1A] border border-red-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-body font-medium text-white mb-2">Trial Expired</h3>
              <p className="text-[#6B6B8A] text-sm mb-4">
                Your 7-day free trial has ended. Subscribe to Pro to continue using NOVA.
              </p>
              <button
                onClick={handleUpgradeToPro}
                className="px-4 py-2 bg-[#C9A84C] hover:bg-[#B8975F] text-[#1A1A2E] font-body font-medium rounded-lg transition-all"
              >
                Upgrade to Pro ($20/month)
              </button>
            </div>
          </div>
        </div>
      )}

      {isProActive && (
        <div className="bg-[#0D0D1A] border border-[#2A9D8F]/30 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <CheckCircle size={24} className="text-[#2A9D8F] flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-body font-medium text-white mb-2">Pro Active</h3>
              <p className="text-[#6B6B8A] text-sm">
                Subscription renews on {new Date(status.subscription_renews_at!).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[#0D0D1A] border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Logout Button */}
      <div className="bg-[#0D0D1A] border border-[#2A2A40]/30 rounded-xl p-6">
        <h2 className="text-lg font-body font-medium text-white mb-4">Session</h2>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-body font-medium rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <LogOut size={16} />
          {loggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </div>
  )
}
