import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, RefreshCw, ChevronDown, ChevronUp,
  Copy, Check, Save, Play, Search, Plus, X, RotateCcw, AlertTriangle
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
  scripting:  'bg-blue-400/20 text-blue-400',
}

const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PART_LABEL = ['Opening','Part 1','Part 2','Part 3','Part 4','Part 5','Part 6']
const EMPTY_FORM = {
  show_id: '', series_topic: '', series_part: '0',
  part_title: '', script_text: '', caption: '',
  post_date: '', post_time_utc: '13:00', status: 'draft'
}

export default function Scripts() {
  const [scripts, setScripts]   = useState<Script[]>([])
  const [shows, setShows]       = useState<ShowInfo[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showFilter, setShowFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [edits, setEdits]       = useState<Record<string, Script>>({})
  const [saving, setSaving]     = useState<string | null>(null)
  const [copied, setCopied]     = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [form, setForm]             = useState({ ...EMPTY_FORM })
  const [createError, setCreateError] = useState('')

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

  function getShow(showId: string) { return shows.find(s => s.id === showId) }

  function edit(script: Script, field: keyof Script, value: string) {
    setEdits(prev => ({ ...prev, [script.id]: { ...(prev[script.id] ?? script), [field]: value } }))
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

  async function regenerate(script: Script) {
    setRegenerating(script.id)
    await supabase.from('show_scripts').update({ status: 'draft' }).eq('id', script.id)
    setScripts(prev => prev.map(s => s.id === script.id ? { ...s, status: 'draft' } : s))
    // Clear any stale edit state for this script
    setEdits(prev => { const n = { ...prev }; delete n[script.id]; return n })
    setRegenerating(null)
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  async function createScript() {
    setCreateError('')
    if (!form.show_id)      return setCreateError('Select a show.')
    if (!form.series_topic) return setCreateError('Series topic is required.')
    if (!form.part_title)   return setCreateError('Part title is required.')
    if (!form.script_text)  return setCreateError('Script text is required.')

    setCreating(true)
    const { error } = await supabase.from('show_scripts').insert({
      show_id:          form.show_id,
      series_topic:     form.series_topic,
      series_part:      parseInt(form.series_part) || 0,
      series_week_start: form.post_date || null,
      part_title:       form.part_title,
      script_text:      form.script_text,
      caption:          form.caption,
      post_date:        form.post_date || null,
      post_time_utc:    form.post_time_utc,
      status:           form.status,
    })
    setCreating(false)
    if (error) return setCreateError(error.message)
    setForm({ ...EMPTY_FORM })
    setShowCreate(false)
    load()
  }

  // Group by show + week
  const showMap = Object.fromEntries(shows.map(s => [s.id, s]))
  const filtered = scripts.filter(s => {
    const matchShow   = showFilter === 'all' || s.show_id === showFilter
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q || s.series_topic.toLowerCase().includes(q) ||
      s.part_title.toLowerCase().includes(q) || s.script_text.toLowerCase().includes(q)
    return matchShow && matchStatus && matchSearch
  })

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

  const failedCount = scripts.filter(s => s.status === 'failed').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">Scripts</h1>
          <p className="text-xs font-mono text-nova-muted mt-0.5">
            {scripts.length} scripts · {groupKeys.length} series
            {failedCount > 0 && (
              <span className="ml-2 text-nova-crimson">· {failedCount} failed</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowCreate(v => !v); setCreateError('') }}
            className={`nova-btn-primary flex items-center gap-1.5 text-xs px-3 py-2 ${showCreate ? 'opacity-70' : ''}`}
          >
            {showCreate ? <><X size={12} /> Cancel</> : <><Plus size={12} /> New Script</>}
          </button>
          <button onClick={load} className="nova-btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Create Script Box ──────────────────────────────────── */}
      {showCreate && (
        <div className="nova-card border-nova-gold/30 bg-nova-navy/80 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-nova-border/40">
            <Plus size={14} className="text-nova-gold" />
            <h2 className="font-display text-base text-nova-gold tracking-wide">Create New Script</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Show */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Show *</label>
              <select
                value={form.show_id}
                onChange={e => setForm(f => ({ ...f, show_id: e.target.value }))}
                className="nova-input w-full text-sm font-body"
              >
                <option value="">— select show —</option>
                {shows.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </div>

            {/* Status */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Initial Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="nova-input w-full text-sm font-body"
              >
                <option value="draft">draft</option>
                <option value="ready">ready</option>
              </select>
            </div>

            {/* Series topic */}
            <div className="col-span-2">
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Series Topic *</label>
              <input
                value={form.series_topic}
                onChange={e => setForm(f => ({ ...f, series_topic: e.target.value }))}
                placeholder="e.g. The Case of Potential With No Execution"
                className="nova-input w-full text-sm font-body"
              />
            </div>

            {/* Part number */}
            <div>
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Part #</label>
              <select
                value={form.series_part}
                onChange={e => setForm(f => ({ ...f, series_part: e.target.value }))}
                className="nova-input w-full text-sm font-body"
              >
                {PART_LABEL.map((l, i) => <option key={i} value={String(i)}>{i} — {l}</option>)}
              </select>
            </div>

            {/* Post date */}
            <div>
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Post Date</label>
              <input
                type="date"
                value={form.post_date}
                onChange={e => setForm(f => ({ ...f, post_date: e.target.value, series_week_start: e.target.value }))}
                className="nova-input w-full text-sm font-body"
              />
            </div>

            {/* Post time */}
            <div>
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Post Time UTC</label>
              <input
                value={form.post_time_utc}
                onChange={e => setForm(f => ({ ...f, post_time_utc: e.target.value }))}
                placeholder="13:00"
                className="nova-input w-full text-sm font-body"
              />
            </div>

            {/* Part title */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Part Title *</label>
              <input
                value={form.part_title}
                onChange={e => setForm(f => ({ ...f, part_title: e.target.value }))}
                placeholder="e.g. Potential Without Action Is Just a Dream"
                className="nova-input w-full text-sm font-body"
              />
            </div>

            {/* Script text */}
            <div className="col-span-2">
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Script *</label>
              <textarea
                value={form.script_text}
                onChange={e => setForm(f => ({ ...f, script_text: e.target.value }))}
                rows={6}
                placeholder="Court is now in session…"
                className="nova-input w-full text-sm font-body resize-y leading-relaxed"
              />
            </div>

            {/* Caption */}
            <div className="col-span-2">
              <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-1 block">Caption</label>
              <textarea
                value={form.caption}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                rows={4}
                placeholder="Post caption with hashtags…"
                className="nova-input w-full text-sm font-body resize-y leading-relaxed"
              />
            </div>
          </div>

          {createError && (
            <p className="text-xs font-mono text-nova-crimson flex items-center gap-1.5">
              <AlertTriangle size={11} /> {createError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowCreate(false); setCreateError('') }}
              className="nova-btn-ghost text-xs px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={createScript}
              disabled={creating}
              className="nova-btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
            >
              {creating
                ? <><Loader2 size={11} className="animate-spin" /> Creating…</>
                : <><Plus size={11} /> Create Script</>}
            </button>
          </div>
        </div>
      )}

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
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="nova-input px-3 py-2 text-sm font-body"
        >
          <option value="all">All statuses</option>
          {['draft','ready','processing','done','failed','scripting'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
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
          const anyFailed = parts.some(p => p.status === 'failed')
          const allDraft  = parts.every(p => p.status === 'draft')

          return (
            <div key={gk} className={`nova-card space-y-0 ${anyFailed ? 'border-nova-crimson/30' : ''}`}>
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
                  {anyFailed && (
                    <span className="nova-badge bg-nova-crimson/20 text-nova-crimson text-xs flex items-center gap-1">
                      <AlertTriangle size={9} /> failed
                    </span>
                  )}
                  {allDraft && !anyFailed && (
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
                    const isFailed = script.status === 'failed'
                    const partLabel = PART_LABEL[script.series_part ?? 0] ?? `Part ${script.series_part}`
                    const dayLabel  = script.post_date
                      ? DAY[new Date(script.post_date + 'T12:00:00Z').getUTCDay()]
                      : ''

                    return (
                      <div
                        key={script.id}
                        className={`p-3 rounded-lg border space-y-3 ${
                          isFailed
                            ? 'bg-nova-crimson/5 border-nova-crimson/30'
                            : 'bg-nova-navydark/40 border-nova-border/40'
                        }`}
                      >
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

                        {/* Failed banner */}
                        {isFailed && (
                          <div className="flex items-center justify-between px-3 py-2 rounded bg-nova-crimson/10 border border-nova-crimson/20">
                            <p className="text-xs font-mono text-nova-crimson flex items-center gap-1.5">
                              <AlertTriangle size={11} /> Script marked failed — click Regenerate to reset to draft
                            </p>
                            <button
                              onClick={() => regenerate(script)}
                              disabled={regenerating === script.id}
                              className="nova-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 text-nova-crimson border-nova-crimson/40 hover:text-white hover:border-nova-crimson/70"
                            >
                              {regenerating === script.id
                                ? <><Loader2 size={11} className="animate-spin" /> Resetting…</>
                                : <><RotateCcw size={11} /> Regenerate</>}
                            </button>
                          </div>
                        )}

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
                          {(script.status === 'draft' || script.status === 'scripting') && (
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
