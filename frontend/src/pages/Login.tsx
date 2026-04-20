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
      const endpoint = mode === 'signup' ? 'nova-guest-signup' : 'nova-guest-login'
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
        const errorMsg = typeof data.error === 'string' 
          ? data.error 
          : (data.error?.message || `${mode === 'login' ? 'Login' : 'Signup'} failed`)
        setError(errorMsg)
        return
      }

      // Store token in localStorage
      localStorage.setItem('nova_guest_token', data.auth_token)
      localStorage.setItem('nova_guest_id', data.guest_id)
      localStorage.setItem('nova_guest_name', data.guest_name || email)

      setSuccess(`${mode === 'login' ? 'Login' : 'Account created'}! Redirecting...`)

      // Redirect to dashboard
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (e) {
      setError((e instanceof Error) ? e.message : String(e))
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
              }}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-nova-gold text-nova-navy'
                  : 'bg-nova-border/20 text-nova-muted hover:bg-nova-border/30'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setMode('signup')
                setError('')
              }}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-nova-gold text-nova-navy'
                  : 'bg-nova-border/20 text-nova-muted hover:bg-nova-border/30'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-nova-muted mb-2">DISPLAY NAME</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 bg-nova-border/20 border border-nova-border/40 rounded-lg text-white placeholder-nova-border/60 focus:outline-none focus:border-nova-gold transition-colors"
                  disabled={loading}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-nova-muted mb-2">EMAIL</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-nova-border/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-nova-border/20 border border-nova-border/40 rounded-lg text-white placeholder-nova-border/60 focus:outline-none focus:border-nova-gold transition-colors"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-nova-muted mb-2">PASSWORD</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-nova-border/50" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-nova-border/20 border border-nova-border/40 rounded-lg text-white placeholder-nova-border/60 focus:outline-none focus:border-nova-gold transition-colors"
                  disabled={loading}
                />
              </div>
              {mode === 'signup' && (
                <p className="text-nova-border/60 text-xs mt-2">Min. 8 characters</p>
              )}
            </div>

            <button
              onClick={handleAuth}
              disabled={loading}
              className="w-full mt-6 py-3 px-4 bg-nova-gold text-nova-navy font-bold rounded-lg hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (mode === 'login' ? 'Logging in...' : 'Creating account...') : (mode === 'login' ? 'Login' : 'Create Account')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-nova-muted">
          <p>👋 Guest Account Benefits: Full access to all NOVA tools.</p>
          <p className="text-xs mt-2 text-nova-border/60">Create your own shows, episodes, scripts, and schedule</p>
        </div>
      </div>
    </div>
  )
}
