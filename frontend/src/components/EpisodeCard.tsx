import { useState } from 'react'
import {
  Video, ExternalLink, Clock, CheckCircle, AlertCircle,
  Loader2, Import, Square, Trash2, AlertTriangle,
  CalendarPlus, Pencil, Check, X, RotateCcw
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AiEpisode } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

interface Props {
  episode: AiEpisode
  onStop?:       (episode: AiEpisode) => Promise<void>
  onDelete?:     (episode: AiEpisode) => Promise<void>
  onSchedule?:   (episode: AiEpisode) => void
  onRegenerate?: (episode: AiEpisode) => void
}

const showColors: Record<string, string> = {
  sunday_power_hour: '#C9A84C',
  motivation_court:  '#2A9D8F',
  tea_time_with_cj:  '#9B5DE5',
  confession_court:  '#C1121F',
}

export default function EpisodeCard({ episode, onStop, onDelete, onSchedule, onRegenerate }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stopping,      setStopping]      = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [regenerating,  setRegenerating]  = useState(false)
  const [actionErr,     setActionErr]     = useState('')

  // Rename state
  const [renaming,   setRenaming]   = useState(false)
  const [nameVal,    setNameVal]    = useState(episode.heygen_title ?? '')
  const [nameSaving, setNameSaving] = useState(false)

  const color     = showColors[episode.show_name] ?? '#C9A84C'
  const date      = new Date(episode.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const showLabel = episode.show_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const videoUrl  = episode.storage_url || episode.heygen_video_url
  const thumbUrl  = episode.heygen_thumbnail_url
  const isStudio  = episode.source === 'heygen_studio'
  const canRegen  = Boolean(episode.script_id) && (episode.status === 'failed' || episode.status === 'complete')

  async function handleStop() {
    if (!onStop) return
    setStopping(true); setActionErr('')
    try { await onStop(episode) }
    catch (e: unknown) { setActionErr(e instanceof Error ? e.message : 'Stop failed') }
    setStopping(false)
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true); setActionErr('')
    try { await onDelete(episode) }
    catch (e: unknown) { setActionErr(e instanceof Error ? e.message : 'Delete failed'); setDeleting(false); setConfirmDelete(false) }
  }

  async function saveRename() {
    const trimmed = nameVal.trim()
    if (!trimmed || trimmed === episode.heygen_title) { setRenaming(false); return }
    setNameSaving(true)
    await supabase.from('ai_episodes').update({ heygen_title: trimmed }).eq('id', episode.id)
    episode.heygen_title = trimmed
    setNameSaving(false)
    setRenaming(false)
  }

  async function handleRegenerate() {
    setRegenerating(true); setActionErr('')
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/regenerate-episode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: episode.id }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.error ?? 'Regenerate failed')
      onRegenerate?.(episode)
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : 'Regenerate failed')
    }
    setRegenerating(false)
  }

  return (
    <div className="nova-card group animate-slide-up relative">

      {/* Show badge + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}18`, color }}>
            {showLabel}
          </span>
          {isStudio && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-nova-violet/15 text-nova-violet">Studio</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {episode.status === 'complete'   && <CheckCircle size={13} className="text-green-400" />}
          {(episode.status === 'generating' || episode.status === 'processing') && <Loader2 size={13} className="animate-spin text-nova-gold" />}
          {episode.status === 'failed'     && <AlertCircle size={13} className="text-nova-crimson" />}
          <span className="text-xs font-mono capitalize text-nova-muted">{episode.status}</span>
        </div>
      </div>

      {/* Thumbnail */}
      <div className="w-full h-32 rounded-lg mb-3 overflow-hidden relative flex items-center justify-center"
        style={{ backgroundColor: `${color}10`, border: `1px solid ${color}22` }}>
        {thumbUrl && <img src={thumbUrl} alt="thumbnail" className="w-full h-full object-cover" />}
        {episode.status === 'complete' && videoUrl ? (
          <a href={videoUrl} target="_blank" rel="noreferrer"
            className={`${thumbUrl ? 'absolute inset-0 bg-black/40' : ''} flex flex-col items-center justify-center gap-1`}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <Video size={18} style={{ color }} />
            </div>
            {!thumbUrl && <span className="text-xs font-mono" style={{ color }}>Play Episode</span>}
          </a>
        ) : (episode.status === 'generating' || episode.status === 'processing') ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
            <Loader2 size={22} className="animate-spin" style={{ color }} />
            <span className="text-xs font-mono text-white/70">NOVA is producing…</span>
          </div>
        ) : episode.status === 'failed' ? (
          <div className="flex flex-col items-center gap-1">
            <AlertCircle size={20} className="text-nova-crimson" />
            <span className="text-xs font-mono text-nova-crimson">Production failed</span>
          </div>
        ) : null}
      </div>

      {/* Title — inline editable */}
      <div className="mb-2">
        {renaming ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false) }}
              className="nova-input flex-1 text-xs py-1 font-body"
              placeholder="Episode name…"
            />
            <button onClick={saveRename} disabled={nameSaving}
              className="text-green-400 hover:text-green-300 p-1 disabled:opacity-40">
              {nameSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            </button>
            <button onClick={() => { setRenaming(false); setNameVal(episode.heygen_title ?? '') }}
              className="text-nova-muted hover:text-white p-1">
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group/title">
            <p className="text-xs font-body text-white/80 line-clamp-1 flex-1 min-w-0">
              {episode.heygen_title || <span className="text-nova-muted/50 italic">Untitled episode</span>}
            </p>
            <button
              onClick={() => { setNameVal(episode.heygen_title ?? ''); setRenaming(true) }}
              className="opacity-0 group-hover/title:opacity-100 text-nova-muted hover:text-nova-gold transition-all p-0.5 shrink-0">
              <Pencil size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 text-xs font-mono text-nova-muted flex-wrap mb-2">
        <span className="flex items-center gap-1"><Clock size={11} /> {date}</span>
        {episode.heygen_duration && <span className="text-nova-muted/60">{episode.heygen_duration}s</span>}
        {episode.heygen_video_url && (
          <a href={episode.heygen_video_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 hover:text-nova-gold transition-colors ml-auto">
            HeyGen <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* Error message */}
      {episode.error_msg && (
        <p className="text-xs font-mono text-nova-crimson bg-nova-crimson/10 rounded p-2 line-clamp-2 mb-2">
          {episode.error_msg}
        </p>
      )}

      {/* Action error */}
      {actionErr && (
        <p className="text-xs font-mono text-nova-crimson bg-nova-crimson/10 rounded px-2 py-1 mb-2">
          {actionErr}
        </p>
      )}

      {/* Delete confirmation */}
      {confirmDelete ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-nova-crimson/10 border border-nova-crimson/30">
          <AlertTriangle size={13} className="text-nova-crimson shrink-0" />
          <span className="text-xs font-mono text-nova-crimson flex-1">Delete this episode?</span>
          <button onClick={handleDelete} disabled={deleting}
            className="text-xs font-mono bg-nova-crimson text-white px-2 py-0.5 rounded hover:bg-nova-crimson/80 disabled:opacity-50 flex items-center gap-1">
            {deleting ? <Loader2 size={10} className="animate-spin" /> : null}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={() => setConfirmDelete(false)} disabled={deleting}
            className="text-xs font-mono text-nova-muted hover:text-white px-2 py-0.5 rounded border border-nova-border">
            Cancel
          </button>
        </div>
      ) : (
        /* Action buttons */
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* Schedule — complete only */}
          {episode.status === 'complete' && onSchedule && (
            <button onClick={() => onSchedule(episode)}
              className="flex items-center gap-1 text-xs font-mono text-nova-muted border border-nova-border/50 px-2 py-1 rounded hover:text-nova-teal hover:border-nova-teal/40 transition-all">
              <CalendarPlus size={11} /> Schedule
            </button>
          )}

          {/* Regenerate — failed or complete, needs script_id */}
          {canRegen && (
            <button onClick={handleRegenerate} disabled={regenerating}
              className="flex items-center gap-1 text-xs font-mono text-nova-muted border border-nova-border/50 px-2 py-1 rounded hover:text-nova-violet hover:border-nova-violet/40 transition-all disabled:opacity-40">
              {regenerating
                ? <><Loader2 size={11} className="animate-spin" /> Queuing…</>
                : <><RotateCcw size={11} /> Regenerate</>}
            </button>
          )}

          {/* Stop — generating only */}
          {episode.status === 'generating' && onStop && (
            <button onClick={handleStop} disabled={stopping}
              className="flex items-center gap-1 text-xs font-mono text-nova-gold border border-nova-gold/30 px-2 py-1 rounded hover:bg-nova-gold/10 transition-all disabled:opacity-40">
              {stopping
                ? <><Loader2 size={11} className="animate-spin" /> Stopping…</>
                : <><Square size={11} className="fill-nova-gold" /> Stop</>}
            </button>
          )}

          {/* Delete */}
          {onDelete && (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-xs font-mono text-nova-muted border border-nova-border px-2 py-1 rounded hover:border-nova-crimson/40 hover:text-nova-crimson transition-all ml-auto">
              <Trash2 size={11} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}


// HeyGen Library card
interface LibraryCardProps {
  video: { video_id: string; title: string; status: string; video_url: string; thumbnail_url: string; duration: string; created_at: number }
  importing: boolean
  onImport: (showName: string) => void
}

const SHOWS_LIST = [
  { key: 'sunday_power_hour', label: 'Sunday Power Hour' },
  { key: 'motivation_court',  label: 'Motivation Court' },
  { key: 'tea_time_with_cj',  label: 'Tea Time with CJ' },
  { key: 'confession_court',  label: 'Confession Court' },
]

export function HeyGenLibraryCard({ video, importing, onImport }: LibraryCardProps) {
  const date = video.created_at
    ? new Date(video.created_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  return (
    <div className="nova-card space-y-3 animate-slide-up">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-nova-violet/15 text-nova-violet">HeyGen Studio</span>
        <span className={`text-xs font-mono capitalize ${video.status === 'completed' ? 'text-green-400' : video.status === 'failed' ? 'text-nova-crimson' : 'text-nova-gold'}`}>{video.status}</span>
      </div>
      <div className="w-full h-32 rounded-lg overflow-hidden bg-nova-navydark/60 border border-nova-border/40 flex items-center justify-center">
        {video.thumbnail_url ? <img src={video.thumbnail_url} alt="thumbnail" className="w-full h-full object-cover" /> : <Video size={24} className="text-nova-muted" />}
      </div>
      {video.title && <p className="text-xs font-body text-white/80 line-clamp-2">{video.title}</p>}
      {date && <p className="text-xs font-mono text-nova-muted flex items-center gap-1"><Clock size={11} />{date}</p>}
      {video.status === 'completed' ? (
        <div className="space-y-2">
          <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">Import to show</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SHOWS_LIST.map(s => (
              <button key={s.key} onClick={() => onImport(s.key)} disabled={importing}
                className="text-xs font-mono px-2 py-1 rounded border border-nova-border text-nova-muted hover:text-white hover:border-nova-violet/50 transition-all disabled:opacity-40 flex items-center gap-1 justify-center">
                {importing ? <Loader2 size={10} className="animate-spin" /> : <Import size={10} />}
                {s.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs font-mono text-nova-muted">Video must be completed to import.</p>
      )}
    </div>
  )
}
