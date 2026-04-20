import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'

const SB_URL = 'https://vzzzqsmqqaoilkmskadl.supabase.co'

type AuthMode = 'login' | 'signup'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleAuth() {
    setError('')
    setSuccess('')

    if (!email || !password) {
      setError('Email and password required')
      return
    }

    if (mode === 'signup' && !guestName) {
      setError('Guest name required')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const endpoint = mode === 'login' ? 'nova-guest-login' : 'nova-guest-signup'
      const body = {
        email,
        password,
        ...(mode === 'signup' && { guest_name: guestName }),
      }

      const res = await fetch(`${SB_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `${mode === 'login' ? 'Login' : 'Signup'} failed`)
        return
      }

      // Store token in localStorage
      localStorage.setItem('nova_guest_token', data.auth_token)
      localStorage.setItem('nova_guest_id', data.guest_id)
      localStorage.setItem('nova_guest_name', data.guest_name || email)
      localStorage.setItem('nova_guest_session_start', Date.now().toString())

      setSuccess(`${mode === 'login' ? 'Login' : 'Account'} successful! Redirecting...`)

      // Redirect to dashboard
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-nova-navy flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-nova-gold flex items-center justify-center">
              <span className="font-display text-nova-navy text-2xl leading-none">N</span>
            </div>
            <span className="font-display text-white text-3xl tracking-wider">NOVA</span>
          </div>
          <p className="text-nova-muted text-sm font-mono">Guest Access Portal</p>
        </div>

        {/* Auth Card */}
        <div className="bg-nova-navydark border border-nova-border/30 rounded-xl p-8">
          {/* Mode Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setMode('login')
                setError('')
                setSuccess('')
              }}
              className={`flex-1 py-2 rounded-lg font-body text-sm transition-all ${
                mode === 'login'
                  ? 'bg-nova-gold text-nova-navy font-medium'
                  : 'bg-nova-border/30 text-nova-muted hover:bg-nova-border/50'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setMode('signup')
                setError('')
                setSuccess('')
              }}
              className={`flex-1 py-2 rounded-lg font-body text-sm transition-all ${
                mode === 'signup'
                  ? 'bg-nova-gold text-nova-navy font-medium'
                  : 'bg-nova-border/30 text-nova-muted hover:bg-nova-border/50'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-nova-muted text-xs mb-6 text-center">
            {mode === 'login'
              ? 'Enter your email and password to access NOVA'
              : 'Create your guest account to get started'}
          </p>

          {/* Guest Name (Signup only) */}
          {mode === 'signup' && (
            <div className="mb-4">
              <label className="block text-nova-muted text-xs font-mono mb-2">DISPLAY NAME</label>
              <input
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Your name or brand"
                className="w-full bg-nova-border/20 border border-nova-border/30 rounded-lg px-4 py-3 text-white placeholder-nova-muted/50 font-body text-sm focus:outline-none focus:border-nova-gold/50 focus:bg-nova-border/30"
              />
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label className="block text-nova-muted text-xs font-mono mb-2">EMAIL</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-3.5 text-nova-muted/50" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value.toLowerCase())}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 bg-nova-border/20 border border-nova-border/30 rounded-lg text-white placeholder-nova-muted/50 font-body text-sm focus:outline-none focus:border-nova-gold/50 focus:bg-nova-border/30"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-6">
            <label className="block text-nova-muted text-xs font-mono mb-2">PASSWORD</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3.5 text-nova-muted/50" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-nova-border/20 border border-nova-border/30 rounded-lg text-white placeholder-nova-muted/50 font-body text-sm focus:outline-none focus:border-nova-gold/50 focus:bg-nova-border/30"
              />
            </div>
            {mode === 'signup' && (
              <p className="text-nova-muted text-xs mt-1">Min. 8 characters</p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex gap-2">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-xs font-body">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-teal-500/10 border border-teal-500/30 flex gap-2">
              <CheckCircle size={16} className="text-teal-400 flex-shrink-0 mt-0.5" />
              <p className="text-teal-300 text-xs font-body">{success}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full py-3 bg-nova-gold hover:bg-nova-gold/90 disabled:opacity-50 text-nova-navy font-body font-medium rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-nova-navy border-t-transparent rounded-full animate-spin" />
                {mode === 'login' ? 'Logging in...' : 'Creating account...'}
              </>
            ) : (
              <>
                {mode === 'login' ? 'Login to NOVA' : 'Create Account'}
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Info Box */}
          <div className="mt-6 p-3 rounded-lg bg-nova-gold/5 border border-nova-gold/20">
            <p className="text-nova-muted text-xs leading-relaxed">
              📢 <strong>Guest Account Benefits:</strong> Full access to all NOVA tools. Create your own shows,
              episodes, scripts, and schedule posts. Your content stays private.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-nova-muted text-xs mt-6 font-mono">
          Powered by NOVA | Secure Guest Access
        </p>
      </div>
    </div>
  )
}
