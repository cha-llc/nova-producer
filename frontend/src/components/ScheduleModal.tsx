import { useState, useEffect } from 'react'
import {
  X, Calendar, Clock, CheckCircle, Loader2, Sparkles, Send
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AiEpisode } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SCHEDULE_URL = `${SUPABASE_URL}/functions/v1/schedule-episode`

const PLATFORMS = [
  { id: 165296, name: 'TikTok',    color: '#ff0050' },
  { id: 165297, name: 'Instagram', color: '#e1306c' },
  { id: 165298, name: 'YouTube',   color: '#ff0000' },
  { id: 177489, name: 'Pinterest', color: '#bd081c' },
  { id: 177891, name: 'LinkedIn',  color: '#0077b5' },
  { id: 177890, name: 'Twitter',   color: '#1da1f2' },
]

const SHOW_DAYS: Record<string, number> = {
  sunday_power_hour: 0,
  motivation_court:  1,
  tea_time_with_cj:  2,
  confession_court:  5,
}

const SHOW_COLOR: Record<string, string> = {
  sunday_power_hour: '#C9A84C',
  motivation_court:  '#2A9D8F',
  tea_time_with_cj:  '#9B5DE5',
  confession_court:  '#C1121F',
}

interface Props {
  episode: AiEpisode
  onClose: () => void
  onScheduled: () => void
}

function nextOccurrence(dayOfWeek: number, hourCST: number): Date {
  const now = new Date()
  const d   = new Date(now)
  d.setUTCHours(hourCST + 6, 0, 0, 0)
  while (d.getUTCDay() !== dayOfWeek || d <= now) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d
}

function toLocalInputs(date: Date) {
  const y  = date.getFullYear()
  const m  = String(date.getMonth() + 1).padStart(2, '0')
  const d  = String(date.getDate()).padStart(2, '0')
  const h  = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return { date: `${y}-${m}-${d}`, time: `${h}:${mi}` }
}

export default function ScheduleModal({ episode, onClose, onScheduled }: Props) {
  const [platforms, setPlatforms]   = useState<number[]>(PLATFORMS.map(p => p.id))
  const [date, setDate]             = useState('')
  const [time, setTime]             = useState('')
  const [caption, setCaption]       = useState('')
  const [partTitle, setPartTitle]   = useState('')
  const [seriesPart, setSeriesPart] = useState<number | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [result, setResult]         = useState<Record<string, string> | null>(null)
  const [recommendation, setRec]    = useState('')

  const showColor = SHOW_COLOR[episode.show_name] ?? '#C9A84C'
  const showLabel = episode.show_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // BUG FIX: pass part directly to avoid reading stale seriesPart state from closure
  function recommend(part: number | null = seriesPart) {
    const showDay = SHOW_DAYS[episode.show_name] ?? 0
    const hourCST = part === 0 ? 18 : 8
    const next    = nextOccurrence(showDay, hourCST)
    const { date: d, time: t } = toLocalInputs(next)
    setDate(d)
    setTime(t)
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][next.getUTCDay()]
    const label   = part === 0 ? 'show opening time (6pm CST)' : 'optimal clip time (8am CST)'
    setRec(`Best for ${showLabel}: ${dayName} ${d} at ${t} — ${label}`)
  }

  useEffect(() => {
    if (episode.script_id) {
      supabase.from('show_scripts')
        .select('caption,part_title,series_part,post_date,post_time_utc')
        .eq('id', episode.script_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCaption(data.caption ?? '')
            setPartTitle(data.part_title ?? '')
            const part = data.series_part ?? null
            setSeriesPart(part)
            if (data.post_date) {
              const postUtc = data.post_time_utc ?? '13:00'
              const dt = new Date(`${data.post_date}T${postUtc}:00Z`)
              const { date: d, time: t } = toLocalInputs(dt)
              setDate(d)
              setTime(t)
              setRec(`Suggested from your content calendar: ${data.post_date} at ${postUtc} UTC`)
            } else {
              // Pass part directly — don't read from state (stale closure fix)
              recommend(part)
            }
          } else {
            recommend(null)
          }
        })
    } else {
      recommend(null)
    }
  }, [])

  function togglePlatform(id: number) {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function schedule() {
    if (!date || !time || !platforms.length) return
    setScheduling(true)
    const localDt = new Date(`${date}T${time}:00`)
    const iso = localDt.toISOString()
    const r = await fetch(SCHEDULE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episode_id: episode.id, scheduled_at: iso, account_ids: platforms }),
    })
    const data = await r.json()
    setResult(data.results ?? {})
    setScheduling(false)
    if (data.success) setTimeout(() => { onScheduled(); onClose() }, 2000)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:'var(--border-radius-lg)', width:'100%', maxWidth:'520px', maxHeight:'90vh', overflowY:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'1rem 1.25rem', borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ width:'3px', height:'36px', borderRadius:'2px', background:showColor, flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:500, fontSize:'15px', color:'var(--color-text-primary)', margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {partTitle || episode.heygen_title || showLabel}
            </p>
            <p style={{ fontSize:'12px', color:'var(--color-text-secondary)', margin:'2px 0 0', fontFamily:'var(--font-mono)' }}>
              {showLabel}{seriesPart !== null ? ` · Part ${seriesPart}` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ color:'var(--color-text-secondary)', cursor:'pointer', padding:'4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding:'1.25rem', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Result */}
          {result && (
            <div style={{ padding:'12px', borderRadius:'var(--border-radius-md)', background:'var(--color-background-secondary)', border:'0.5px solid var(--color-border-tertiary)' }}>
              <p style={{ fontSize:'12px', fontFamily:'var(--font-mono)', fontWeight:500, color:'var(--color-text-primary)', marginBottom:'8px' }}>Schedule result</p>
              {Object.entries(result).map(([p, r]) => (
                <p key={p} style={{ fontSize:'12px', fontFamily:'var(--font-mono)', color: r === '✅' ? 'var(--color-text-success)' : 'var(--color-text-danger)', margin:'2px 0' }}>{p}: {r}</p>
              ))}
            </div>
          )}

          {/* Platforms */}
          <div>
            <p style={{ fontSize:'11px', fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Platforms</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => togglePlatform(p.id)}
                  style={{ padding:'5px 12px', borderRadius:'4px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'0.5px solid', borderColor: platforms.includes(p.id) ? p.color : 'var(--color-border-tertiary)', background: platforms.includes(p.id) ? `${p.color}22` : 'transparent', color: platforms.includes(p.id) ? p.color : 'var(--color-text-secondary)', transition:'all 0.15s' }}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' }}>
                <Calendar size={11} /> Date
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="nova-input" style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' }}>
                <Clock size={11} /> Time (local)
              </label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="nova-input" style={{ width:'100%' }} />
            </div>
          </div>

          {/* Recommend button */}
          <button onClick={() => recommend()}
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', borderRadius:'var(--border-radius-md)', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', cursor:'pointer', fontSize:'12px', color:'var(--color-text-secondary)', textAlign:'left' }}>
            <Sparkles size={13} style={{ color:showColor, flexShrink:0 }} />
            <span style={{ flex:1, lineHeight:1.4 }}>{recommendation || 'Click to get recommended time'}</span>
          </button>

          {/* Caption preview */}
          {caption && (
            <div>
              <p style={{ fontSize:'11px', fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' }}>Caption preview</p>
              <div style={{ padding:'10px 12px', borderRadius:'var(--border-radius-md)', background:'var(--color-background-secondary)', border:'0.5px solid var(--color-border-tertiary)', fontSize:'12px', color:'var(--color-text-secondary)', whiteSpace:'pre-wrap', maxHeight:'100px', overflowY:'auto', lineHeight:1.5 }}>
                {caption}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'4px' }}>
            <button onClick={onClose} className="nova-btn-ghost" style={{ fontSize:'13px', padding:'8px 16px' }}>Cancel</button>
            <button onClick={schedule} disabled={scheduling || !date || !time || !platforms.length || Boolean(result)}
              className="nova-btn-primary"
              style={{ fontSize:'13px', padding:'8px 16px', display:'flex', alignItems:'center', gap:'6px', opacity: (!date || !time || !platforms.length) ? 0.5 : 1 }}>
              {scheduling
                ? <><Loader2 size={13} className="animate-spin" /> Scheduling…</>
                : result
                ? <><CheckCircle size={13} /> Scheduled</>
                : <><Send size={13} /> Schedule</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
