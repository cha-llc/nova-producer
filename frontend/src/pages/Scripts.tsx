import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, RefreshCw, ChevronDown, ChevronUp,
  Copy, Check, Save, Play, Search
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Script = {
  id: string
  show_id: string
  series_topic: string
  series_part: number | null
  series_week_start: string | null
  part_title: string
  script_text: string
  caption: string
  status: string
  post_date: string | null
  post_time_utc: string
}

type ShowInfo = { id: string; show_name: string; display_name: string; color: string }

const STATUS_COLOR: Record<string, string> = {
  draft:      'bg-nova-border/50 text-nova-muted',
  ready:      'bg-nova-gold/20 text-nova-gold',
  processing: 'bg-nova-violet/20 text-nova-violet',
  done:       'bg-green-400/20 text-green-400',
  failed:     'bg-nova-crimson/20 text-nova-crimson',
}

const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PART_LABEL = ['Opening','Part 1','Part 2','Part 3','Part 4','Part 5','Part 6']

export default function Scripts() {
  const [scripts, setScripts]   = useState<Script[]>([])
  const [shows, setShows]       = useState<ShowInfo[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showFilter, setShowFilter] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [edits, setEdits]       = useState<Record<string, Script>>({})
  const [saving, setSaving]     = useState<string | null>(null)
  const [copied, setCopied]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sc }, { data: sh }] = await Promise.all([
      supabase
        .from('show_scripts')
        .select('id,show_id,series_topic,series_part,series_week_start,part_title,script_text,caption,status,post_date,post_time_utc')
        .neq('series_topic', '')
        .order('series_week_start', { ascending: true })
        .order('series_part', { ascending: true }),
      supabase.from('show_configs').select('id,show_name,display_name,color'),
    ])
    setScripts(sc ?? [])
    setShows(sh ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getShow(showId: string) {
    return shows.find(s => s.id === showId)
  }

  function edit(script: Script, field: keyof Script, value: string) {
    setEdits(prev => ({
      ...prev,
      [script.id]: { ...(prev[script.id] ?? script), [field]: value }
    }))
  }

  function edited(scriptId: string) {
    return edits[scriptId] ?? scripts.find(s => s.id === scriptId)!
  }

  async function save(scriptId: string) {
    const e = edits[scriptId]
    if (!e) return
    setSaving(scriptId)
    await supabase.from('show_scripts').update({
      part_title:  e.part_title,
      script_text: e.script_text,
      caption:     e.caption,
    }).eq('id', scriptId)
    setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, ...e } : s))
    setSaving(null)
  }

  async function setReady(scriptId: string) {
    await supabase.from('show_scripts').update({ status: 'ready' }).eq('id', scriptId)
    setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, status: 'ready' } : s))
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  // Group by show + week
  const showMap = Object.fromEntries(shows.map(s => [s.id, s]))
  const filtered = scripts.filter(s => {
    const matchShow = showFilter === 'all' || s.show_id === showFilter
    const q = search.toLowerCase()
    const matchSearch = !q || s.series_topic.toLowerCase().includes(q) ||
      s.part_title.toLowerCase().includes(q) || s.script_text.toLowerCase().includes(q)
    return matchShow && matchSearch
  })

  // Group: show_id + series_week_start + series_topic
  const groups = filtered.reduce<Record<string, Script[]>>((acc, s) => {
    const key = `${s.show_id}::${s.series_week_start}::${s.series_topic}`
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  const groupKeys = Object.keys(groups).sort((a, b) => {
    const dateA = groups[a][0]?.series_week_start ?? ''
    const dateB = groups[b][0]?.series_week_start ?? ''
    return dateA.localeCompare(dateB)
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">Scripts</h1>
          <p className="text-xs font-mono text-nova-muted mt-0.5">{scripts.length} scripts across {groupKeys.length} series</p>
        </div>
        <button onClick={load} className="nova-btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48 flex items-center gap-2 nova-input px-3 py-2">
          <Search size={13} className="text-nova-muted shrink-0" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search topics, titles, scripts…"
            className="bg-transparent outline-none w-full text-sm font-body text-white placeholder:text-nova-muted/50"
          />
        </div>
        <select
          value={showFilter} onChange={e => setShowFilter(e.target.value)}
          className="nova-input px-3 py-2 text-sm font-body"
        >
          <option value="all">All shows</option>
          {shows.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-nova-muted" />
        </div>
      ) : groupKeys.length === 0 ? (
        <p className="text-nova-muted text-sm font-body text-center py-16">No scripts match your search.</p>
      ) : (
        groupKeys.map(gk => {
          const parts  = groups[gk]
          const first  = parts[0]
          const show   = showMap[first.show_id]
          const color  = show?.color ?? '#C9A84C'
          const isOpen = expanded[gk] !== false
          const allDraft    = parts.every(p => p.status === 'draft')
          const anyDirty    = parts.some(p => edits[p.id])

          return (
            <div key={gk} className="nova-card space-y-0">
              {/* Group header */}
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [gk]: !isOpen }))}
                className="w-full flex items-center gap-3 pb-3 border-b border-nova-border/40"
              >
                <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 text-left">
                  <p className="text-white font-display text-base tracking-wide">{first.series_topic}</p>
                  <p className="text-xs font-mono text-nova-muted mt-0.5">
                    {show?.display_name} · {first.series_week_start} · {parts.length} parts
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {allDraft && (
                    <span className="nova-badge bg-nova-border/50 text-nova-muted text-xs">draft</span>
                  )}
                  {isOpen ? <ChevronUp size={14} className="text-nova-muted" /> : <ChevronDown size={14} className="text-nova-muted" />}
                </div>
              </button>

              {/* Parts */}
              {isOpen && (
                <div className="space-y-4 pt-3">
                  {parts.sort((a,b) => (a.series_part??0) - (b.series_part??0)).map(script => {
                    const e   = edited(script.id)
                    const dirty = Boolean(edits[script.id])
                    const partLabel = PART_LABEL[script.series_part ?? 0] ?? `Part ${script.series_part}`
                    const dayLabel  = script.post_date
                      ? DAY[new Date(script.post_date + 'T12:00:00Z').getUTCDay()]
                      : ''

                    return (
                      <div key={script.id} className="p-3 rounded-lg bg-nova-navydark/40 border border-nova-border/40 space-y-3">
                        {/* Part header */}
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: `${color}22`, color }}>
                            {partLabel}
                          </span>
                          {dayLabel && (
                            <span className="font-mono text-xs text-nova-muted">{dayLabel} · {script.post_date}</span>
                          )}
                          <span className={`nova-badge ml-auto ${STATUS_COLOR[script.status] ?? STATUS_COLOR.draft}`}>
                            {script.status}
                          </span>
                        </div>

                        {/* Title */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-mono text-nova-muted uppercase tracking-widest">Title</label>
                            <button
                              onClick={() => copyText(e.part_title, `${script.id}-title`)}
                              className="text-xs font-mono text-nova-muted hover:text-white flex items-center gap-1"
                            >
                              {copied === `${script.id}-title` ? <><Check size={10} className="text-green-400" /> copied</> : <><Copy size={10} /> copy</>}
                            </button>
                          </div>
                          <input
                            value={e.part_title}
                            onChange={ev => edit(script, 'part_title', ev.target.value)}
                            className="nova-input w-full text-sm font-body"
                          />
                        </div>

                        {/* Script */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-mono text-nova-muted uppercase tracking-widest">Script</label>
                            <button
                              onClick={() => copyText(e.script_text, `${script.id}-script`)}
                              className="text-xs font-mono text-nova-muted hover:text-white flex items-center gap-1"
                            >
                              {copied === `${script.id}-script` ? <><Check size={10} className="text-green-400" /> copied</> : <><Copy size={10} /> copy</>}
                            </button>
                          </div>
                          <textarea
                            value={e.script_text}
                            onChange={ev => edit(script, 'script_text', ev.target.value)}
                            rows={6}
                            className="nova-input w-full text-sm font-body resize-y leading-relaxed"
                          />
                        </div>

                        {/* Caption */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-mono text-nova-muted uppercase tracking-widest">Caption</label>
                            <button
                              onClick={() => copyText(e.caption, `${script.id}-caption`)}
                              className="text-xs font-mono text-nova-muted hover:text-white flex items-center gap-1"
                            >
                              {copied === `${script.id}-caption` ? <><Check size={10} className="text-green-400" /> copied</> : <><Copy size={10} /> copy</>}
                            </button>
                          </div>
                          <textarea
                            value={e.caption}
                            onChange={ev => edit(script, 'caption', ev.target.value)}
                            rows={5}
                            className="nova-input w-full text-sm font-body resize-y leading-relaxed"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 justify-end pt-1">
                          {script.status === 'draft' && (
                            <button
                              onClick={() => setReady(script.id)}
                              className="nova-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5"
                            >
                              <Play size={11} /> Queue for NOVA
                            </button>
                          )}
                          <button
                            onClick={() => save(script.id)}
                            disabled={!dirty || saving === script.id}
                            className={`nova-btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 ${!dirty ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            {saving === script.id
                              ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                              : <><Save size={11} /> Save</>}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
