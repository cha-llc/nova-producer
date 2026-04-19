import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, Loader2, Palette, ExternalLink } from 'lucide-react'

// Hardcoded — not a secret, prevents "Failed to fetch" when env var resolves to "undefined"
const SUPABASE_URL = 'https://vzzzqsmqqaoilkmskadl.supabase.co'

type Status = 'exchanging' | 'success' | 'error' | 'no_code'

export default function CanvaCallback() {
  const [status, setStatus]   = useState<Status>('exchanging')
  const [error, setError]     = useState('')
  const [scope, setScope]     = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const err    = params.get('error')

    if (err) {
      setStatus('error')
      setError(params.get('error_description') || err)
      return
    }
    if (!code) {
      setStatus('no_code')
      return
    }

    ;(async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/canva-oauth`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ code }),
        })
        const d = await r.json()
        if (d.success) {
          setScope(d.scope ?? '')
          setStatus('success')
          window.history.replaceState({}, '', '/canva-callback')
        } else {
          setStatus('error')
          setError(d.error || `Exchange failed (${r.status})`)
        }
      } catch (e) {
        setStatus('error')
        setError(String(e))
      }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-nova-navydark flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">

        <div className="flex items-center gap-3 justify-center">
          <div className="w-10 h-10 rounded-xl bg-nova-gold flex items-center justify-center">
            <span className="font-display text-nova-navy text-2xl leading-none">N</span>
          </div>
          <div className="text-left">
            <span className="font-display text-white text-2xl tracking-wider">NOVA</span>
            <p className="text-xs font-mono text-nova-muted -mt-0.5">CANVA OAUTH</p>
          </div>
          <Palette size={20} style={{ color: '#A855F7' }} className="ml-2" />
        </div>

        {status === 'exchanging' && (
          <div className="nova-card space-y-4">
            <Loader2 size={40} className="animate-spin mx-auto" style={{ color: '#A855F7' }} />
            <p className="font-display text-xl text-white tracking-wide">CONNECTING TO CANVA</p>
            <p className="text-sm font-mono text-nova-muted">Exchanging authorization code…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="nova-card border border-nova-teal/40 space-y-4">
            <CheckCircle size={48} className="text-nova-teal mx-auto" />
            <p className="font-display text-2xl text-nova-teal tracking-wide">CANVA CONNECTED</p>
            <p className="text-sm font-mono text-nova-muted leading-relaxed">
              Refresh token stored in Supabase.<br />
              NOVA will now auto-generate fal.ai + Canva composite thumbnails.
            </p>
            {scope && (
              <p className="text-xs font-mono text-nova-muted">{scope.replace(/ /g, ' · ')}</p>
            )}
            <a href="/studio"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-nova-navy text-sm font-body font-semibold hover:brightness-110 transition-all"
              style={{ backgroundColor: '#C9A84C' }}>
              Go to Content Studio <ExternalLink size={14} />
            </a>
          </div>
        )}

        {(status === 'error' || status === 'no_code') && (
          <div className="nova-card border border-nova-crimson/40 space-y-4">
            <AlertCircle size={40} className="text-nova-crimson mx-auto" />
            <p className="font-display text-xl text-nova-crimson tracking-wide">
              {status === 'no_code' ? 'NO CODE RECEIVED' : 'CONNECTION FAILED'}
            </p>
            <p className="text-sm font-mono text-nova-muted">{error || 'No authorization code found.'}</p>
            <p className="text-xs font-mono text-nova-muted leading-relaxed">
              Go to Settings → Canva Templates → click <strong>Connect Canva</strong> to try again.
            </p>
            <a href="/settings"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-nova-border text-nova-muted text-sm font-body hover:text-white transition-all">
              ← Back to Settings
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
