import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ScriptEditor from '../components/ScriptEditor'
import type { ShowConfig, ShowScript } from '../types'

const STATUS_ORDER = ['ready','processing','draft','done','failed'] as const

export default function Scripts() {
  const [params] = useSearchParams()
  const [shows, setShows]       = useState<ShowConfig[]>([])
  const [scripts, setScripts]   = useState<ShowScript[]>([])
  const [filter, setFilter]     = useState(params.get('show') ?? 'all')
  const [loading, setLoading]   = useState(true)

  async function loadData() {
    setLoading(true)
    const [showsRes, scriptsRes] = await Promise.all([
      supabase.from('show_configs').select('*').order('display_name'),
      supabase.from('show_scripts')
        .select('*, show:show_configs(*)')
        .order('created_at', { ascending: false }),
    ])
    setShows(showsRes.data ?? [])
    setScripts(scriptsRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function markReady(id: string) {
    await supabase.from('show_scripts').update({ status: 'ready' }).eq('id', id)
    setScripts(prev => prev.map(s => s.id === id ? { ...s, status: 'ready' } : s))
  }

  async function deleteScript(id: string) {
    if (!confirm('Delete this script?')) return
    await supabase.from('show_scripts').delete().eq('id', id)
    setScripts(prev => prev.filter(s => s.id !== id))
  }

  const filtered = filter === 'all'
    ? scripts
    : scripts.filter(s => (s.show as ShowConfig)?.show_name === filter)

  const showColors: Record<string, string> = {
    sunday_power_hour:  '#C9A84C',
    motivation_court:   '#2A9D8F',
    tea_time_with_cj:   '#9B5DE5',
    confession_court:   '#C1121F',
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-white tracking-wide">Scripts</h1>
        <button onClick={loadData} className="nova-btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: editor */}
        <div className="lg:col-span-1">
          <ScriptEditor
            shows={shows}
            onSaved={s => setScripts(prev => [s, ...prev])}
          />
        </div>

        {/* Right: list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${
                filter === 'all'
                  ? 'bg-nova-gold/10 border-nova-gold text-nova-gold'
                  : 'border-nova-border text-nova-muted hover:text-white'
              }`}
            >
              All ({scripts.length})
            </button>
            {shows.map(s => (
              <button
                key={s.id}
                onClick={() => setFilter(s.show_name)}
                className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${
                  filter === s.show_name
                    ? 'border-opacity-100 text-white'
                    : 'border-nova-border text-nova-muted hover:text-white'
                }`}
                style={filter === s.show_name
                  ? { borderColor: showColors[s.show_name], backgroundColor: `${showColors[s.show_name]}15`, color: showColors[s.show_name] }
                  : {}
                }
              >
                {s.display_name}
              </button>
            ))}
          </div>

          {/* Script list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-nova-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="nova-card text-center py-12">
              <p className="text-nova-muted font-body text-sm">No scripts yet. Write your first one →</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(script => {
                const show = script.show as ShowConfig
                const color = show ? showColors[show.show_name] : '#C9A84C'
                const wordCount = script.script_text.trim().split(/\s+/).length
                return (
                  <div key={script.id} className="nova-card hover:border-nova-border/80 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span
                            className="text-xs font-mono px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${color}18`, color }}
                          >
                            {show?.display_name ?? 'Unknown'}
                          </span>
                          <span className={`status-${script.status}`}>
                            {script.status}
                          </span>
                          <span className="text-xs font-mono text-nova-muted">{wordCount} words</span>
                        </div>
                        <p className="text-sm font-body text-white/80 line-clamp-2 leading-relaxed">
                          {script.script_text}
                        </p>
                        {script.caption && (
                          <p className="text-xs font-mono text-nova-muted mt-1 line-clamp-1">
                            Caption: {script.caption}
                          </p>
                        )}
                        <p className="text-xs font-mono text-nova-muted mt-2">
                          {new Date(script.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {script.status === 'draft' && (
                          <button
                            onClick={() => markReady(script.id)}
                            className="nova-btn-primary text-xs py-1 px-3"
                          >
                            Produce
                          </button>
                        )}
                        <button
                          onClick={() => deleteScript(script.id)}
                          className="p-1.5 rounded-lg border border-nova-border text-nova-muted hover:text-nova-crimson hover:border-nova-crimson transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
