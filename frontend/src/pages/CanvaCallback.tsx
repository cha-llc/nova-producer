import { useEffect, useState } from 'react'
import { Copy, Check, CheckCircle, AlertCircle } from 'lucide-react'

export default function CanvaCallback() {
  const [code, setCode]     = useState('')
  const [error, setError]   = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('code')
    const e = params.get('error')
    if (c) setCode(c)
    if (e) setError(params.get('error_description') || e)
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="min-h-screen bg-nova-navydark flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-nova-gold flex items-center justify-center">
            <span className="font-display text-nova-navy text-2xl leading-none">N</span>
          </div>
          <div>
            <span className="font-display text-white text-2xl tracking-wider">NOVA</span>
            <p className="text-xs font-mono text-nova-muted -mt-0.5">CANVA OAUTH</p>
          </div>
        </div>

        {error ? (
          <div className="nova-card border border-nova-crimson/40">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={18} className="text-nova-crimson" />
              <h2 className="font-display text-nova-crimson text-lg">Authorization Failed</h2>
            </div>
            <p className="text-sm font-mono text-nova-muted">{error}</p>
            <p className="text-xs font-mono text-nova-muted mt-3">
              Go back to the Canva Developer Portal and try again.
            </p>
          </div>
        ) : code ? (
          <div className="nova-card border border-nova-teal/40 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-nova-teal" />
              <h2 className="font-display text-nova-teal text-lg">Authorization Code Received</h2>
            </div>
            <p className="text-sm font-mono text-nova-muted leading-relaxed">
              Copy this code and paste it into the curl command to exchange for your refresh_token.
              This code expires in 10 minutes.
            </p>
            <div className="bg-nova-navydark rounded-xl p-4 border border-nova-border">
              <div className="flex items-start justify-between gap-2">
                <code className="text-xs font-mono text-nova-gold break-all flex-1">{code}</code>
                <button onClick={copy}
                  className="flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded-lg border border-nova-border text-nova-muted hover:text-nova-gold hover:border-nova-gold/40 transition-all flex-shrink-0">
                  {copied ? <><Check size={12} className="text-nova-teal" /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
            </div>
            <div className="text-xs font-mono text-nova-muted space-y-1">
              <p className="text-white font-semibold">Next step — run this in your terminal:</p>
              <div className="bg-nova-navydark rounded-lg p-3 border border-nova-border overflow-x-auto">
                <code className="text-nova-teal whitespace-pre text-[10px]">{`curl -X POST "https://api.canva.com/rest/v1/oauth/token" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -H "Authorization: Basic $(echo -n 'CLIENT_ID:CLIENT_SECRET' | base64)" \\
  -d "grant_type=authorization_code" \\
  -d "code=${code}" \\
  -d "code_verifier=YOUR_CODE_VERIFIER" \\
  -d "redirect_uri=https://nova-producer.vercel.app/canva-callback"`}</code>
              </div>
              <p className="mt-2 text-nova-muted">
                The response JSON will contain <code className="text-nova-gold">refresh_token</code>.
                Add that to Supabase Edge Function Secrets as <code className="text-nova-gold">CANVA_REFRESH_TOKEN</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="nova-card text-center py-12">
            <p className="font-display text-nova-muted text-xl tracking-wide">Waiting for Canva...</p>
            <p className="text-sm font-mono text-nova-muted mt-2">
              No code received. Check the URL parameters.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
