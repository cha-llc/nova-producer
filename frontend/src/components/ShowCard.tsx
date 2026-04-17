import { Mic, Calendar } from 'lucide-react'
import type { ShowConfig } from '../types'

interface Props {
  show: ShowConfig
  scriptCount: number
  episodeCount: number
  onClick?: () => void
}

export default function ShowCard({ show, scriptCount, episodeCount, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="nova-card w-full text-left hover:border-nova-gold/40 transition-all duration-200 group"
    >
      {/* Color accent bar */}
      <div
        className="w-full h-0.5 rounded-full mb-4 opacity-80"
        style={{ backgroundColor: show.color }}
      />

      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${show.color}22` }}
        >
          <Mic size={16} style={{ color: show.color }} />
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${show.color}18`, color: show.color }}
        >
          {show.day_of_week}
        </span>
      </div>

      <h3 className="font-display text-white text-xl tracking-wide leading-tight mb-1 group-hover:text-nova-gold transition-colors">
        {show.display_name}
      </h3>
      <p className="text-nova-muted text-xs font-body line-clamp-2 mb-4">
        {show.description}
      </p>

      <div className="flex items-center gap-4 pt-3 border-t border-nova-border">
        <div className="flex items-center gap-1.5">
          <Calendar size={11} className="text-nova-muted" />
          <span className="text-xs font-mono text-nova-muted">{scriptCount} scripts</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-nova-teal" />
          <span className="text-xs font-mono text-nova-teal">{episodeCount} episodes</span>
        </div>
      </div>
    </button>
  )
}
