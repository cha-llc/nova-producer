import { Video, ExternalLink, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { AiEpisode } from '../types'

interface Props { episode: AiEpisode }

const statusIcon = {
  generating: <Loader2 size={13} className="animate-spin text-nova-gold" />,
  complete:   <CheckCircle size={13} className="text-green-400" />,
  failed:     <AlertCircle size={13} className="text-nova-crimson" />,
}

const showColors: Record<string, string> = {
  sunday_power_hour:  '#C9A84C',
  motivation_court:   '#2A9D8F',
  tea_time_with_cj:   '#9B5DE5',
  confession_court:   '#C1121F',
}

export default function EpisodeCard({ episode }: Props) {
  const color = showColors[episode.show_name] ?? '#C9A84C'
  const date  = new Date(episode.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
  const showLabel = episode.show_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="nova-card hover:border-nova-border transition-colors group animate-slide-up">
      {/* Show accent */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {showLabel}
        </span>
        <div className="flex items-center gap-1.5">
          {statusIcon[episode.status]}
          <span className="text-xs font-mono capitalize text-nova-muted">{episode.status}</span>
        </div>
      </div>

      {/* Video thumbnail placeholder */}
      <div
        className="w-full h-28 rounded-lg mb-3 flex items-center justify-center"
        style={{ backgroundColor: `${color}10`, border: `1px solid ${color}22` }}
      >
        {episode.status === 'complete' && episode.storage_url ? (
          <a
            href={episode.storage_url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-1 group/play"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${color}30` }}
            >
              <Video size={18} style={{ color }} />
            </div>
            <span className="text-xs font-mono" style={{ color }}>Play Episode</span>
          </a>
        ) : episode.status === 'generating' ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={22} className="animate-spin" style={{ color }} />
            <span className="text-xs font-mono text-nova-muted">NOVA is producing…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <AlertCircle size={20} className="text-nova-crimson" />
            <span className="text-xs font-mono text-nova-crimson">Production failed</span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs font-mono text-nova-muted">
        <span className="flex items-center gap-1"><Clock size={11} /> {date}</span>
        {episode.heygen_video_url && (
          <a
            href={episode.heygen_video_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-nova-gold transition-colors ml-auto"
          >
            HeyGen <ExternalLink size={10} />
          </a>
        )}
        {episode.audio_url && (
          <a
            href={episode.audio_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-nova-teal transition-colors"
          >
            Audio <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* Error message */}
      {episode.error_msg && (
        <p className="mt-2 text-xs font-mono text-nova-crimson bg-nova-crimson/10 rounded p-2 line-clamp-2">
          {episode.error_msg}
        </p>
      )}
    </div>
  )
}
