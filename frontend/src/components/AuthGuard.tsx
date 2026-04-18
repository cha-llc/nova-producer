import { useEffect, useState, ReactNode, Fragment } from 'react'

const BUDGET_MANAGER = 'https://cha-budget-manager.vercel.app'
const SUPABASE_URL   = 'https://vzzzqsmqqaoilkmskadl.supabase.co'
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enpxc21xcWFvaWxrbXNrYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjYzMjQsImV4cCI6MjA5MTQ0MjMyNH0.vYkiz5BeoJlhNzcEiiGQfsHLE5UfqJbTTBjNXk1xxJs'
const STORAGE_KEY    = 'cha_nova_token'
const APP_NAME       = 'nova'

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_access_tokens?token=eq.${token}&app=eq.${APP_NAME}&select=id`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    )
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

interface Props { children: ReactNode }

export default function AuthGuard({ children }: Props) {
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking')

  useEffect(() => {
    ;(async () => {
      const params   = new URLSearchParams(window.location.search)
      const urlToken = params.get('access_token')

      if (urlToken) {
        const valid = await validateToken(urlToken)
        if (valid) {
          localStorage.setItem(STORAGE_KEY, urlToken)
          params.delete('access_token')
          const clean = params.toString()
          window.history.replaceState({}, '', clean ? `?${clean}` : window.location.pathname)
          setState('allowed')
          return
        }
      }

      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const valid = await validateToken(stored)
        if (valid) {
          setState('allowed')
          return
        }
        localStorage.removeItem(STORAGE_KEY)
      }

      setState('denied')
      window.location.href = `${BUDGET_MANAGER}/login?redirect=nova`
    })()
  }, [])

  if (state === 'checking') return (
    <div style={{ minHeight:'100vh', background:'#0D0D1A', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, background:'#C9A84C', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28, fontWeight:900, color:'#1A1A2E' }}>N</div>
        <p style={{ color:'#6B6B8A', fontSize:13, letterSpacing:1, fontFamily:'sans-serif' }}>Verifying access…</p>
      </div>
    </div>
  )

  if (state === 'denied') return null

  return <Fragment>{children}</Fragment>
}
