import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EpisodeCard from '../components/EpisodeCard'
import type { AiEpisode, EpisodeStatus } from '../types'

const SHOWS = [
  { key: 'all',               label: 'All Shows' },
  { key: 'sunday_power_hour', label: 'Sunday Power Hour' },
  { key: 'motivation_court',  label: 'Motivation Court' },
  { key: 'tea_time_with_cj',  label: 'Tea Time with CJ' },
  { key: 'confession_court',  label: 'Confession Court' },
]

const STATUS_FILTERS: { key: EpisodeStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'complete',   label: 'Published' },
  { key: 'generating', label: 'Generating' },
  { key: 'failed',     label: 'Failed' },
]

export default function Episodes() {
  const [episodes, setEpisodes]   = useState<AiEpisode[]>([])
  const [showFilter, setShow]     = useState('all')
  const [statusFilter, setStatus] = useState<EpisodeStatus | 'all'>('all')
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ai_episodes')
      .select('*')
      .order('created_at', { ascending: false })
    setEpisodes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Real-time updates for generating episodes
  useEffect(() => {
    const channel = supabase
      .channel('episodes-live')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ai_episodes',
      }, payload => {
        if (payload.eventType === 'INSERT') {
          setEpisodes(prev => [payload.new as AiEpisode, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setEpisodes(prev => prev.map(e => e.id === (payload.new as AiEpisode).id ? payload.new as AiEpisode : e))
        } else if (payload.eventType === 'DELETE') {
          setEpisodes(prev => prev.filter(e => e.id !== (payload.old as AiEpisode).id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = episodes.filter(ep => {
    const matchShow   = showFilter   === 'all' || ep.show_name === showFilter
    const matchStatus = statusFilter === 'all' || ep.status === statusFilter
    return matchShow && matchStatus
  })

  const generating = episodes.filter(e => e.status === 'generating').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">Episodes</h1>
          {generating > 0 && (
            <p className="text-xs font-mono text-nova-gold mt-0.5 animate-pulse">
              ⚡ {generating} episode{generating > 1 ? 's' : ''} generating now…
            </p>
          )}
        </div>
        <button onClick={load} className="nova-btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-nova-muted" />
          <div className="flex gap-1.5 flex-wrap">
            {SHOWS.map(s => (
              <button
                key={s.key}
                onClick={() => setShow(s.key)}
                className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                  showFilter === s.key
                    ? 'bg-nova-gold/10 border-nova-gold text-nova-gold'
                    : 'border-nova-border text-nova-muted hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                statusFilter === s.key
                  ? 'bg-nova-teal/10 border-nova-teal text-nova-teal'
                  : 'border-nova-border text-nova-muted hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="nova-card h-48 animate-pulse bg-nova-border/20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="nova-card text-center py-20">
          <p className="font-display text-nova-muted text-2xl tracking-wide mb-2">NO EPISODES YET</p>
          <p className="text-sm font-body text-nova-muted">
            Write a script and hit <span className="text-nova-gold">Produce with NOVA</span> to generate your first episode.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(ep => <EpisodeCard key={ep.id} episode={ep} />)}
        </div>
      )}

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs font-mono text-nova-muted text-center">
          {filtered.length} episode{filtered.length !== 1 ? 's' : ''}
          {(showFilter !== 'all' || statusFilter !== 'all') && ' (filtered)'}
        </p>
      )}
    </div>
  )
}
