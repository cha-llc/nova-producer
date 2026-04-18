import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Filter, Library, Tv, AlertTriangle } from 'lucide-react'
import ScheduleModal from '../components/ScheduleModal'
import { supabase } from '../lib/supabase'
import EpisodeCard, { HeyGenLibraryCard } from '../components/EpisodeCard'
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
  { key: 'all',        label: 'All' },
  { key: 'complete',   label: 'Published' },
  { key: 'generating', label: 'Generating' },
  { key: 'failed',     label: 'Failed' },
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

  const loadNova = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ai_episodes').select('*').order('created_at', { ascending: false })
    setEpisodes(data ?? [])
    setLoading(false)
  }, [])

  const loadHeyGen = useCallback(async () => {
    setHgLoading(true)
    setHgError('')
    try {
      const r    = await fetch(`${PROXY_URL}?action=list`)
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setHeygenVids(data.videos ?? [])
    } catch (e: unknown) {
      setHgError(e instanceof Error ? e.message : String(e))
    }
    setHgLoading(false)
  }, [])

  useEffect(() => { loadNova() }, [loadNova])
  useEffect(() => { if (tab === 'heygen') loadHeyGen() }, [tab, loadHeyGen])

  // Real-time
  useEffect(() => {
    const ch = supabase.channel('episodes-live')
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
    // Extract HeyGen video_id from heygen_video_url if available; otherwise use heygen_title as fallback
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
    // Optimistic UI
    setEpisodes(p => p.map(e => e.id === episode.id
      ? { ...e, status: 'failed', error_msg: 'Cancelled by user.' } : e))
  }

  // Delete an episode
  async function handleDelete(episode: AiEpisode) {
    const videoId = episode.heygen_video_url
      ? episode.heygen_video_url.match(/video_id=([^&]+)/)?.[1] ?? ''
      : ''
    // Derive storage path from storage_url if it's a Supabase URL
    const storagePath = episode.storage_url?.includes('/newsletter-assets/')
      ? episode.storage_url.split('/newsletter-assets/')[1]?.split('?')[0] ?? ''
      : ''
    const r = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:       'delete',
        episode_id:   episode.id,
        video_id:     videoId,
        storage_path: storagePath,
      }),
    })
    const d = await r.json()
    if (!d.success) throw new Error(d.error ?? 'Delete failed')
    // Remove from state immediately
    setEpisodes(p => p.filter(e => e.id !== episode.id))
  }

  async function importVideo(videoId: string, showName: string) {
    setImporting(videoId)
    setImportMsg('')
    try {
      const r    = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', video_id: videoId, show_name: showName }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Import failed')
      setImportMsg(`✓ Imported to ${showName.replace(/_/g, ' ')}`)
      loadNova()
    } catch (e: unknown) {
      setImportMsg(e instanceof Error ? e.message : 'Import failed')
    }
    setImporting(null)
  }

  const filtered = episodes.filter(ep => {
    const matchShow   = showFilter   === 'all' || ep.show_name === showFilter
    const matchStatus = statusFilter === 'all' || ep.status    === statusFilter
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
              ⚡ {generating} generating…
            </p>
          )}
        </div>
        <button onClick={tab === 'nova' ? loadNova : loadHeyGen}
          className="nova-btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border border-nova-border rounded-lg p-1 w-fit">
        <button onClick={() => setTab('nova')}
          className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded transition-all ${
            tab === 'nova' ? 'bg-nova-gold/10 text-nova-gold' : 'text-nova-muted hover:text-white'}`}>
          <Tv size={12} /> NOVA Episodes
        </button>
        <button onClick={() => setTab('heygen')}
          className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded transition-all ${
            tab === 'heygen' ? 'bg-nova-violet/10 text-nova-violet' : 'text-nova-muted hover:text-white'}`}>
          <Library size={12} /> HeyGen Library
        </button>
      </div>

      {/* NOVA tab */}
      {tab === 'nova' && (
        <>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-nova-muted" />
              <div className="flex gap-1.5 flex-wrap">
                {SHOWS.map(s => (
                  <button key={s.key} onClick={() => setShow(s.key)}
                    className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                      showFilter === s.key
                        ? 'bg-nova-gold/10 border-nova-gold text-nova-gold'
                        : 'border-nova-border text-nova-muted hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_FILTERS.map(s => (
                <button key={s.key} onClick={() => setStatus(s.key)}
                  className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                    statusFilter === s.key
                      ? 'bg-nova-teal/10 border-nova-teal text-nova-teal'
                      : 'border-nova-border text-nova-muted hover:text-white'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="nova-card h-52 animate-pulse bg-nova-border/20" />)}
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
              Studio videos below can be imported manually.
            </p>
          </div>

          {importMsg && (
            <p className={`text-xs font-mono px-3 py-2 rounded ${
              importMsg.startsWith('✓') ? 'bg-green-400/10 text-green-400' : 'bg-nova-crimson/10 text-nova-crimson'}`}>
              {importMsg}
            </p>
          )}

          {hgLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="nova-card h-52 animate-pulse bg-nova-border/20" />)}
            </div>
          ) : hgError ? (
            <div className="nova-card text-center py-16">
              <p className="font-mono text-nova-crimson text-sm mb-2">{hgError}</p>
              <button onClick={loadHeyGen} className="nova-btn-ghost text-xs mt-2">Retry</button>
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
  )
}