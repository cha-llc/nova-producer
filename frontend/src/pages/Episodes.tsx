import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Filter, Library, Tv, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EpisodeCard, { HeyGenLibraryCard } from '../components/EpisodeCard'
import ScheduleModal from '../components/ScheduleModal'
import type { AiEpisode, EpisodeStatus, HeyGenVideo } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const PROXY_URL    = `${SUPABASE_URL}/functions/v1/heygen-proxy`

const SHOWS = [
  { key: 'all',               label: 'All Shows' },
  { key: 'sunday_power_hour', label: 'Sunday Power Hour' },
  { key: 'motivation_court',  label: 'Motivation Court' },
  { key: 'tea_time_with_cj',  label: 'Tea Time with CJ' },
  { key: 'confession_court',  label: 'Confession Court' },
]
const STATUS_FILTERS: { key: EpisodeStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All'        },
  { key: 'complete',   label: 'Complete'   },
  { key: 'generating', label: 'Generating' },
  { key: 'processing', label: 'Processing' },
  { key: 'failed',     label: 'Failed'     },
]

type Tab = 'nova' | 'heygen'

export default function Episodes() {
  const [tab, setTab]               = useState<Tab>('nova')
  const [episodes, setEpisodes]     = useState<AiEpisode[]>([])
  const [heygenVids, setHeygenVids] = useState<HeyGenVideo[]>([])
  const [showFilter, setShow]       = useState('all')
  const [statusFilter, setStatus]   = useState<EpisodeStatus | 'all'>('all')
  const [loading, setLoading]       = useState(true)
  const [hgLoading, setHgLoading]   = useState(false)
  const [hgError, setHgError]       = useState('')
  const [importing, setImporting]   = useState<string | null>(null)
  const [importMsg, setImportMsg]   = useState('')
  const [scheduleEp, setScheduleEp] = useState<AiEpisode | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ai_episodes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setEpisodes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('episodes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_episodes' }, payload => {
        if (payload.eventType === 'INSERT')
          setEpisodes(p => [payload.new as AiEpisode, ...p])
        else if (payload.eventType === 'UPDATE')
          setEpisodes(p => p.map(e => e.id === (payload.new as AiEpisode).id ? payload.new as AiEpisode : e))
        else if (payload.eventType === 'DELETE')
          setEpisodes(p => p.filter(e => e.id !== (payload.old as AiEpisode).id))
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Stop a generating episode
  async function handleStop(episode: AiEpisode) {
    const videoId = episode.heygen_video_url
      ? episode.heygen_video_url.match(/video_id=([^&]+)/)?.[1] ?? ''
      : ''
    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:     'cancel',
        episode_id: episode.id,
        video_id:   videoId,
        script_id:  episode.script_id ?? '',
      }),
    }).then(r => r.json()).then(d => { if (!d.success) throw new Error(d.error) })
    setEpisodes(p => p.map(e => e.id === episode.id
      ? { ...e, status: 'failed', error_msg: 'Cancelled by user.' } : e))
  }

  // Delete an episode
  async function handleDelete(episode: AiEpisode) {
    const videoId = episode.heygen_video_url
      ? episode.heygen_video_url.match(/video_id=([^&]+)/)?.[1] ?? ''
      : ''
    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:     'delete',
        episode_id: episode.id,
        video_id:   videoId,
        script_id:  episode.script_id ?? '',
      }),
    }).then(r => r.json())
    setEpisodes(p => p.filter(e => e.id !== episode.id))
  }

  // Load HeyGen library
  async function loadHeyGen() {
    setHgLoading(true)
    setHgError('')
    try {
      const r = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.error ?? 'Failed to load HeyGen library')
      setHeygenVids(d.videos ?? [])
    } catch (e) {
      setHgError(String(e))
    }
    setHgLoading(false)
  }

  // Import a HeyGen video
  async function importVideo(videoId: string, showName: string) {
    setImporting(videoId)
    setImportMsg('')
    try {
      const r = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', video_id: videoId, show_name: showName }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.error ?? 'Import failed')
      setImportMsg(`Imported to ${showName.replace(/_/g,' ')}`)
      load()
    } catch (e) {
      setImportMsg(`Error: ${String(e)}`)
    }
    setImporting(null)
  }

  const filtered = episodes.filter(ep => {
    const matchShow   = showFilter === 'all' || ep.show_name === showFilter
    const matchStatus = statusFilter === 'all' || ep.status === statusFilter
    return matchShow && matchStatus
  })

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl text-white tracking-wide">Episodes</h1>
            <p className="text-xs font-mono text-nova-muted mt-0.5">
              {episodes.length} total · {episodes.filter(e => e.status === 'complete').length} complete
            </p>
          </div>
          <button onClick={load} className="nova-btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-nova-border pb-0">
          <button
            onClick={() => setTab('nova')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-body border-b-2 -mb-px transition-colors ${
              tab === 'nova' ? 'border-nova-gold text-nova-gold' : 'border-transparent text-nova-muted hover:text-white'
            }`}
          >
            <Tv size={14} /> NOVA Episodes
          </button>
          <button
            onClick={() => { setTab('heygen'); if (!heygenVids.length) loadHeyGen() }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-body border-b-2 -mb-px transition-colors ${
              tab === 'heygen' ? 'border-nova-violet text-nova-violet' : 'border-transparent text-nova-muted hover:text-white'
            }`}
          >
            <Library size={14} /> HeyGen Library
          </button>
        </div>

        {/* NOVA Episodes tab */}
        {tab === 'nova' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <Filter size={13} className="text-nova-muted" />
              {SHOWS.map(s => (
                <button key={s.key} onClick={() => setShow(s.key)}
                  className={`nova-badge cursor-pointer transition-colors ${
                    showFilter === s.key ? 'bg-nova-gold/20 text-nova-gold' : 'bg-nova-border/40 text-nova-muted hover:text-white'
                  }`}>
                  {s.label}
                </button>
              ))}
              <div className="w-px h-4 bg-nova-border mx-1" />
              {STATUS_FILTERS.map(s => (
                <button key={s.key} onClick={() => setStatus(s.key)}
                  className={`nova-badge cursor-pointer transition-colors ${
                    statusFilter === s.key ? 'bg-nova-teal/20 text-nova-teal' : 'bg-nova-border/40 text-nova-muted hover:text-white'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nova-gold" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="nova-card text-center py-20">
                <p className="font-display text-nova-muted text-2xl tracking-wide mb-2">NO EPISODES YET</p>
                <p className="text-sm font-body text-nova-muted">
                  Write a script → <span className="text-nova-gold">Produce with NOVA</span>, or import from HeyGen Library.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(ep => (
                  <EpisodeCard
                    key={ep.id}
                    episode={ep}
                    onStop={ep.status === 'generating' ? handleStop : undefined}
                    onDelete={handleDelete}
                    onSchedule={ep.status === 'complete' ? (e) => setScheduleEp(e) : undefined}
                  />
                ))}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <p className="text-xs font-mono text-nova-muted text-center">
                {filtered.length} episode{filtered.length !== 1 ? 's' : ''}
                {(showFilter !== 'all' || statusFilter !== 'all') && ' (filtered)'}
              </p>
            )}
          </>
        )}

        {/* HeyGen Library tab */}
        {tab === 'heygen' && (
          <div className="space-y-5">
            <div className="nova-card border-nova-violet/20 space-y-1">
              <p className="text-sm font-body text-white font-semibold">HeyGen Studio Library</p>
              <p className="text-xs font-body text-nova-muted leading-relaxed">
                All videos from your HeyGen account. Import any completed video into a NOVA show to post via Socialblu.
              </p>
            </div>

            <div className="nova-card border-nova-gold/20 flex items-start gap-3">
              <AlertTriangle size={16} className="text-nova-gold shrink-0 mt-0.5" />
              <p className="text-xs font-body text-nova-muted leading-relaxed">
                <span className="text-nova-gold font-semibold">HeyGen API Credits needed for NOVA auto-generation. </span>
                Purchase at <a href="https://app.heygen.com/billing" target="_blank" rel="noreferrer"
                  className="text-nova-gold underline">app.heygen.com/billing</a>.
              </p>
            </div>

            {importMsg && (
              <p className={`text-sm font-mono px-3 py-2 rounded ${importMsg.startsWith('Error') ? 'bg-nova-crimson/10 text-nova-crimson' : 'bg-green-400/10 text-green-400'}`}>
                {importMsg}
              </p>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm font-body text-nova-muted">{heygenVids.length} videos in library</p>
              <button onClick={loadHeyGen} disabled={hgLoading}
                className="nova-btn-ghost flex items-center gap-1.5 text-xs">
                <RefreshCw size={12} className={hgLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {hgError && <p className="text-nova-crimson text-sm font-mono">{hgError}</p>}

            {hgLoading ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nova-violet" />
              </div>
            ) : heygenVids.length === 0 ? (
              <div className="nova-card text-center py-20">
                <p className="font-display text-nova-muted text-2xl tracking-wide mb-2">NO HEYGEN VIDEOS</p>
                <p className="text-sm font-body text-nova-muted">
                  Create videos in <a href="https://app.heygen.com" target="_blank" rel="noreferrer"
                    className="text-nova-violet underline">HeyGen Studio</a> and they'll appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {heygenVids.map(v => (
                  <HeyGenLibraryCard
                    key={v.video_id}
                    video={v}
                    importing={importing === v.video_id}
                    onImport={(show) => importVideo(v.video_id, show)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {scheduleEp && (
        <ScheduleModal
          episode={scheduleEp}
          onClose={() => setScheduleEp(null)}
          onScheduled={() => { setScheduleEp(null); load() }}
        />
      )}
    </>
  )
}
