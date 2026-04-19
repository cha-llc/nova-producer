import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import {
  X, Calendar, Clock, CheckCircle, Loader2, Sparkles, Send,
  Hash, Plus, Tag
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AiEpisode } from '../types'

// Hardcoded — prevents "undefined" when env var doesn't resolve
const SUPABASE_URL   = 'https://vzzzqsmqqaoilkmskadl.supabase.co'
const SCHEDULE_URL   = `${SUPABASE_URL}/functions/v1/schedule-episode`

const PLATFORMS = [
  { id: 165296, name: 'TikTok',    color: '#ff0050', emoji: '🎵' },
  { id: 165297, name: 'Instagram', color: '#e1306c', emoji: '📸' },
  { id: 165298, name: 'YouTube',   color: '#ff0000', emoji: '▶️' },
  { id: 177489, name: 'Pinterest', color: '#bd081c', emoji: '📌' },
  { id: 177779, name: 'Reddit',    color: '#ff4500', emoji: '👾' },
  { id: 177890, name: 'Twitter',   color: '#1da1f2', emoji: '✖' },
  { id: 177891, name: 'LinkedIn',  color: '#0077b5', emoji: '💼' },
]

const SHOW_DAYS: Record<string, number>  = { sunday_power_hour:0, motivation_court:1, tea_time_with_cj:2, confession_court:5 }
const SHOW_COLOR: Record<string, string> = { sunday_power_hour:'#C9A84C', motivation_court:'#2A9D8F', tea_time_with_cj:'#9B5DE5', confession_court:'#C1121F' }

interface Props { episode: AiEpisode; onClose: () => void; onScheduled: () => void }

function nextOccurrence(dayOfWeek: number, hourCST: number): Date {
  const now = new Date(); const d = new Date(now)
  d.setUTCHours(hourCST + 6, 0, 0, 0)
  while (d.getUTCDay() !== dayOfWeek || d <= now) d.setUTCDate(d.getUTCDate() + 1)
  return d
}
function toLocalInputs(date: Date) {
  const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0')
  const h=String(date.getHours()).padStart(2,'0'), mi=String(date.getMinutes()).padStart(2,'0')
  return { date:`${y}-${m}-${d}`, time:`${h}:${mi}` }
}

export default function ScheduleModal({ episode, onClose, onScheduled }: Props) {
  const [platforms,  setPlatforms]  = useState<number[]>(PLATFORMS.map(p => p.id))
  const [date,       setDate]       = useState('')
  const [time,       setTime]       = useState('')
  // content fields
  const [hook,       setHook]       = useState('')
  const [caption,    setCaption]    = useState('')
  const [cta,        setCta]        = useState('')
  const [hashtags,   setHashtags]   = useState<string[]>([])
  const [hashInput,  setHashInput]  = useState('')
  // meta
  const [partTitle,  setPartTitle]  = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [result,     setResult]     = useState<Record<string, string> | null>(null)
  const [rec,        setRec]        = useState('')
  const [loading,    setLoading]    = useState(true)
  const hashRef = useRef<HTMLInputElement>(null)

  const showColor = SHOW_COLOR[episode.show_name] ?? '#C9A84C'
  const showLabel = episode.show_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  function recommend(part: number | null = null) {
    const showDay = SHOW_DAYS[episode.show_name] ?? 0
    const hourCST = part === 0 ? 18 : 8
    const next    = nextOccurrence(showDay, hourCST)
    const { date: d, time: t } = toLocalInputs(next)
    setDate(d); setTime(t)
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][next.getUTCDay()]
    setRec(`Best for ${showLabel}: ${dayName} ${d} at ${t} — ${part === 0 ? 'show time 6pm CST' : 'peak time 8am CST'}`)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      // 1. Load social content (hook, caption, cta, hashtags)
      const { data: sc } = await supabase
        .from('nova_social_content').select('hook,caption,cta,hashtags,episode_title')
        .eq('episode_id', episode.id).maybeSingle()
      if (sc) {
        setHook(sc.hook ?? '')
        setCaption(sc.caption ?? '')
        setCta(sc.cta ?? '')
        setHashtags(Array.isArray(sc.hashtags) ? sc.hashtags : [])
        if (sc.episode_title) setPartTitle(sc.episode_title)
      }
      // 2. Fall back to show_scripts for title / post_date
      if (episode.script_id) {
        const { data: ss } = await supabase
          .from('show_scripts').select('caption,part_title,series_part,post_date,post_time_utc')
          .eq('id', episode.script_id).single()
        if (ss) {
          if (!sc?.caption && ss.caption) setCaption(ss.caption)
          if (!sc?.episode_title && ss.part_title) setPartTitle(ss.part_title)
          const part = ss.series_part ?? null
          if (ss.post_date) {
            const postUtc = ss.post_time_utc ?? '13:00'
            const dt = new Date(`${ss.post_date}T${postUtc}:00Z`)
            const { date: d, time: t } = toLocalInputs(dt)
            setDate(d); setTime(t)
            setRec(`From content calendar: ${ss.post_date} at ${postUtc} UTC`)
          } else { recommend(part) }
        } else { recommend(null) }
      } else {
        recommend(null)
        if (!partTitle) setPartTitle(episode.heygen_title || showLabel)
      }
      setLoading(false)
    }
    load()
  }, [])

  function togglePlatform(id: number) {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function addHashtag() {
    const tag = hashInput.trim().replace(/^#+/, '')
    if (tag && !hashtags.includes(tag)) {
      setHashtags(prev => [...prev, tag])
    }
    setHashInput('')
    hashRef.current?.focus()
  }

  function onHashKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addHashtag() }
    if (e.key === 'Backspace' && !hashInput && hashtags.length) {
      setHashtags(prev => prev.slice(0, -1))
    }
  }

  function removeHashtag(tag: string) {
    setHashtags(prev => prev.filter(t => t !== tag))
  }

  // Preview of final composed content
  const hashString = hashtags.map(h => `#${h}`).join(' ')
  const composed = [hook, caption, cta, hashString].filter(Boolean).join('\n\n')

  async function schedule() {
    if (!date || !time || !platforms.length) return
    setScheduling(true)
    const localDt  = new Date(`${date}T${time}:00`)
    const iso      = localDt.toISOString()
    const r = await fetch(SCHEDULE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        episode_id:   episode.id,
        scheduled_at: iso,
        account_ids:  platforms,
        hook,
        caption,
        cta,
        hashtags,
      }),
    })
    const data = await r.json()
    setResult(data.results ?? {})
    setScheduling(false)
    if (data.success) setTimeout(() => { onScheduled(); onClose() }, 2000)
  }

  const S: React.CSSProperties = { display:'flex', flexDirection:'column', gap:'4px' }
  const labelStyle: React.CSSProperties = { fontSize:'10px', fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.08em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:'var(--border-radius-lg)', width:'100%', maxWidth:'560px', maxHeight:'92vh', overflowY:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', borderBottom:'0.5px solid var(--color-border-tertiary)', position:'sticky', top:0, background:'var(--color-background-primary)', zIndex:1 }}>
          <div style={{ width:'3px', height:'36px', borderRadius:'2px', background:showColor, flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:600, fontSize:'14px', color:'var(--color-text-primary)', margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {partTitle || episode.heygen_title || showLabel}
            </p>
            <p style={{ fontSize:'11px', color:'var(--color-text-secondary)', margin:'2px 0 0', fontFamily:'var(--font-mono)' }}>
              Schedule to Socialblu · {showLabel}
            </p>
          </div>
          <button onClick={onClose} style={{ color:'var(--color-text-secondary)', cursor:'pointer', padding:'4px' }}><X size={16} /></button>
        </div>

        <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'16px' }}>

          {loading && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--color-text-secondary)', fontSize:'13px' }}>
              <Loader2 size={14} className="animate-spin" /> Loading social content…
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ padding:'12px', borderRadius:'var(--border-radius-md)', background:'var(--color-background-secondary)', border:'0.5px solid var(--color-border-tertiary)' }}>
              <p style={{ fontSize:'11px', fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--color-text-primary)', marginBottom:'8px' }}>SCHEDULE RESULT</p>
              {Object.entries(result).map(([p, r]) => (
                <p key={p} style={{ fontSize:'12px', fontFamily:'var(--font-mono)', color: r === '✅' ? '#2A9D8F' : '#C1121F', margin:'2px 0' }}>{p}: {r}</p>
              ))}
            </div>
          )}

          {/* Platforms */}
          <div style={S}>
            <span style={labelStyle}>Platforms</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => togglePlatform(p.id)}
                  style={{ padding:'5px 10px', borderRadius:'6px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'0.5px solid', borderColor: platforms.includes(p.id) ? p.color : 'var(--color-border-tertiary)', background: platforms.includes(p.id) ? `${p.color}22` : 'transparent', color: platforms.includes(p.id) ? p.color : 'var(--color-text-secondary)', transition:'all 0.15s' }}>
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Hook */}
          <div style={S}>
            <label style={labelStyle}><Tag size={9} style={{display:'inline', marginRight:'4px'}}/>Hook</label>
            <input value={hook} onChange={e => setHook(e.target.value)} placeholder="Opening hook that stops the scroll…"
              className="nova-input" style={{ fontSize:'13px' }} />
          </div>

          {/* Caption */}
          <div style={S}>
            <label style={labelStyle}><span style={{marginRight:'4px'}}>✍️</span>Caption</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Main caption body…" rows={4}
              className="nova-input" style={{ fontSize:'13px', resize:'vertical', lineHeight:1.5 }} />
          </div>

          {/* CTA */}
          <div style={S}>
            <label style={labelStyle}><span style={{marginRight:'4px'}}>👉</span>CTA</label>
            <input value={cta} onChange={e => setCta(e.target.value)} placeholder="Call to action…"
              className="nova-input" style={{ fontSize:'13px' }} />
          </div>

          {/* Hashtags */}
          <div style={S}>
            <label style={labelStyle}><Hash size={9} style={{display:'inline', marginRight:'4px'}}/>Hashtags</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'8px', borderRadius:'var(--border-radius-md)', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', minHeight:'42px', alignItems:'center', cursor:'text' }}
              onClick={() => hashRef.current?.focus()}>
              {hashtags.map(tag => (
                <span key={tag} style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 8px', borderRadius:'4px', background:`${showColor}22`, border:`0.5px solid ${showColor}44`, color:showColor, fontSize:'12px', fontFamily:'var(--font-mono)', fontWeight:500 }}>
                  #{tag}
                  <button onClick={e => { e.stopPropagation(); removeHashtag(tag) }} style={{ color:showColor, cursor:'pointer', lineHeight:1, marginLeft:'2px' }}>×</button>
                </span>
              ))}
              <input ref={hashRef} value={hashInput} onChange={e => setHashInput(e.target.value)} onKeyDown={onHashKey}
                placeholder={hashtags.length ? '' : 'Type tag + Enter…'}
                style={{ border:'none', background:'transparent', outline:'none', fontSize:'12px', color:'var(--color-text-primary)', fontFamily:'var(--font-mono)', minWidth:'100px', flex:1 }} />
              {hashInput && (
                <button onClick={addHashtag} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'11px', color:showColor, cursor:'pointer', padding:'2px 6px', borderRadius:'4px', border:`0.5px solid ${showColor}44` }}>
                  <Plus size={10} /> Add
                </button>
              )}
            </div>
            <p style={{ fontSize:'10px', color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)', margin:'2px 0 0' }}>Press Enter, comma, or space to add · Backspace removes last</p>
          </div>

          {/* Date + Time */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div style={S}>
              <label style={{ ...labelStyle, display:'flex', alignItems:'center', gap:'4px' }}><Calendar size={10}/>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="nova-input" />
            </div>
            <div style={S}>
              <label style={{ ...labelStyle, display:'flex', alignItems:'center', gap:'4px' }}><Clock size={10}/>Time (local)</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="nova-input" />
            </div>
          </div>

          <button onClick={() => recommend()}
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', borderRadius:'var(--border-radius-md)', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', cursor:'pointer', fontSize:'12px', color:'var(--color-text-secondary)', textAlign:'left' }}>
            <Sparkles size={13} style={{ color:showColor, flexShrink:0 }} />
            <span style={{ flex:1, lineHeight:1.4 }}>{rec || 'Click for recommended posting time'}</span>
          </button>

          {/* Composed preview */}
          {composed && (
            <div style={S}>
              <label style={labelStyle}>📋 Composed Preview</label>
              <div style={{ padding:'10px 12px', borderRadius:'var(--border-radius-md)', background:'var(--color-background-secondary)', border:'0.5px solid var(--color-border-tertiary)', fontSize:'12px', color:'var(--color-text-secondary)', whiteSpace:'pre-wrap', maxHeight:'120px', overflowY:'auto', lineHeight:1.6, fontFamily:'var(--font-body)' }}>
                {composed}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'4px' }}>
            <button onClick={onClose} className="nova-btn-ghost" style={{ fontSize:'13px', padding:'8px 16px' }}>Cancel</button>
            <button onClick={schedule}
              disabled={scheduling || !date || !time || !platforms.length || Boolean(result)}
              className="nova-btn-primary"
              style={{ fontSize:'13px', padding:'8px 18px', display:'flex', alignItems:'center', gap:'6px', opacity:(!date||!time||!platforms.length)?0.5:1 }}>
              {scheduling
                ? <><Loader2 size={13} className="animate-spin"/>Scheduling…</>
                : result
                ? <><CheckCircle size={13}/>Scheduled</>
                : <><Send size={13}/>Schedule Post</>}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
