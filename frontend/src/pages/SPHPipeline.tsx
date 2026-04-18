import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Play, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const PIPELINE_URL = `${SUPABASE_URL}/functions/v1/sph-pipeline`

const CATEGORY_COLORS: Record<string, string> = {
  'Motivation vs. Discipline':      '#C9A84C',
  'Consistency vs. Intensity':      '#2A9D8F',
  'Comfort Culture vs. Growth':     '#9B5DE5',
  'Routines & Structure':           '#C1121F',
  'Accountability & Identity':      '#4CC9F0',
}
const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-nova-border/50 text-nova-muted',
  scripting: 'bg-nova-gold/20 text-nova-gold',
  producing: 'bg-nova-violet/20 text-nova-violet',
  scheduled: 'bg-nova-teal/20 text-nova-teal',
  complete:  'bg-green-400/20 text-green-400',
}

interface Topic {
  id: string; topic: string; category: string; week_number: number
  week_start_date: string; status: string
}

export default function SPHPipeline() {
  const [weeks, setWeeks]         = useState<Topic[]>([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({})
  const [acting, setActing]       = useState<number | null>(null)
  const [msg, setMsg]             = useState('')

  async function load() {
    setLoading(true)
    const r = await fetch(`${PIPELINE_URL}?action=status`)
    const d = await r.json()
    setWeeks(d.weeks ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(weekNum: number) {
    setActing(weekNum)
    setMsg('')
    const r = await fetch(PIPELINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', week_number: weekNum }),
    })
    const d = await r.json()
    setActing(null)
    if (d.success) {
      setMsg(`✅ Week ${weekNum} approved — ${d.queued} parts queued for NOVA production`)
      load()
    } else {
      setMsg(`❌ ${d.error}`)
    }
  }

  async function generate(weekNum: number) {
    setActing(weekNum)
    setMsg(`⏳ Generating scripts for Week ${weekNum} via Claude API…`)
    const r = await fetch(PIPELINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', week_number: weekNum }),
    })
    const d = await r.json()
    setActing(null)
    if (d.success) {
      setMsg(`✅ Week ${weekNum} scripted — review in Supabase then approve to produce`)
      load()
    } else {
      setMsg(`❌ ${d.error}`)
    }
  }

  // Group by category
  const categories = [...new Set(weeks.map(w => w.category))]
  const byCategory = Object.fromEntries(categories.map(c => [c, weeks.filter(w => w.category === c)]))

  const stats = {
    total:     weeks.length,
    pending:   weeks.filter(w => w.status === 'pending').length,
    scripting: weeks.filter(w => w.status === 'scripting').length,
    producing: weeks.filter(w => w.status === 'producing').length,
    scheduled: weeks.filter(w => w.status === 'scheduled').length,
    complete:  weeks.filter(w => w.status === 'complete').length,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">☀️ SPH Pipeline</h1>
          <p className="text-xs font-mono text-nova-muted mt-0.5">Sunday Power Hour · 46 weeks · April 2026 → February 2027</p>
        </div>
        <button onClick={load} className="nova-btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Pending',   val: stats.pending,   color: 'text-nova-muted' },
          { label: 'Scripting', val: stats.scripting, color: 'text-nova-gold' },
          { label: 'Producing', val: stats.producing, color: 'text-nova-violet' },
          { label: 'Scheduled', val: stats.scheduled, color: 'text-nova-teal' },
          { label: 'Complete',  val: stats.complete,  color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="nova-card py-3 text-center">
            <p className={`text-2xl font-display tracking-wide ${s.color}`}>{s.val}</p>
            <p className="text-xs font-mono text-nova-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {msg && (
        <p className={`text-sm font-mono px-3 py-2 rounded ${msg.startsWith('✅') ? 'bg-green-400/10 text-green-400' : msg.startsWith('⏳') ? 'bg-nova-gold/10 text-nova-gold' : 'bg-nova-crimson/10 text-nova-crimson'}`}>
          {msg}
        </p>
      )}

      {/* Setup note */}
      <div className="nova-card border-nova-gold/20 text-xs font-body text-nova-muted space-y-1">
        <p className="text-nova-gold font-semibold">One-time setup needed:</p>
        <p>1. Add <code className="font-mono text-white bg-nova-navydark px-1 rounded">ANTHROPIC_API_KEY</code> to Supabase secrets (console.anthropic.com → API Keys) — required for auto-generating future weeks' scripts</p>
        <p>2. Enable <code className="font-mono text-white bg-nova-navydark px-1 rounded">pg_cron</code> in Supabase Dashboard → Database → Extensions. Once enabled, run the schedule command shown in #nova Slack.</p>
      </div>

      {/* Categories */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-nova-muted" /></div>
      ) : (
        categories.map(cat => {
          const color    = CATEGORY_COLORS[cat] ?? '#C9A84C'
          const catWeeks = byCategory[cat] ?? []
          const isOpen   = expanded[cat] !== false
          return (
            <div key={cat} className="nova-card space-y-3">
              <button onClick={() => setExpanded(p => ({ ...p, [cat]: !isOpen }))}
                className="w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 rounded-full" style={{ backgroundColor: color }} />
                  <h2 className="font-display text-white text-lg tracking-wide">{cat}</h2>
                  <span className="text-xs font-mono text-nova-muted">{catWeeks.length} weeks</span>
                </div>
                {isOpen ? <ChevronUp size={14} className="text-nova-muted" /> : <ChevronDown size={14} className="text-nova-muted" />}
              </button>

              {isOpen && (
                <div className="space-y-2">
                  {catWeeks.map(w => (
                    <div key={w.id} className="flex items-center gap-3 p-3 rounded-lg bg-nova-navydark/40 border border-nova-border/40">
                      <span className="font-mono text-xs text-nova-muted w-8 shrink-0">W{w.week_number}</span>
                      <span className="font-mono text-xs text-nova-muted w-20 shrink-0">{w.week_start_date}</span>
                      <span className="flex-1 text-sm font-body text-white">{w.topic}</span>
                      <span className={`nova-badge text-xs ${STATUS_STYLES[w.status] ?? STATUS_STYLES.pending}`}>
                        {w.status}
                      </span>
                      {w.status === 'pending' && (
                        <button onClick={() => generate(w.week_number)} disabled={acting === w.week_number}
                          className="nova-btn-ghost text-xs flex items-center gap-1 px-2 py-1">
                          {acting === w.week_number ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                          Generate
                        </button>
                      )}
                      {w.status === 'scripting' && (
                        <button onClick={() => approve(w.week_number)} disabled={acting === w.week_number}
                          className="nova-btn-primary text-xs flex items-center gap-1 px-2 py-1">
                          {acting === w.week_number ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                          Approve
                        </button>
                      )}
                      {w.status === 'producing' && (
                        <span className="text-xs font-mono text-nova-violet flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> NOVA producing
                        </span>
                      )}
                      {(w.status === 'scheduled' || w.status === 'complete') && (
                        <span className="text-xs font-mono text-nova-teal flex items-center gap-1">
                          <Clock size={10} /> {w.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
