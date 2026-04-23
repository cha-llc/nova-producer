import { useState } from 'react'
import { Flame, Play, Loader2, AlertTriangle } from 'lucide-react'
import { VideoClip } from '../types'
import { logger, trackEvent } from '../lib/error-handling'

interface ClipsGalleryProps {
  clips: VideoClip[]
  episodeId: string
  onGenerateMore?: () => Promise<void>
  isGenerating?: boolean
}

export default function ClipsGallery({ clips, episodeId, onGenerateMore, isGenerating = false }: ClipsGalleryProps) {
  const [selectedClip, setSelectedClip] = useState<VideoClip | null>(null)
  const [loadingVideo, setLoadingVideo] = useState<string | null>(null)

  const sortedClips = [...clips].sort((a, b) => (b.virality_score || 0) - (a.virality_score || 0))

  const handlePlayClip = async (clip: VideoClip) => {
    if (!clip.video_url) {
      logger.warn('Clip video URL not available yet', { clipId: clip.id })
      return
    }

    setLoadingVideo(clip.id)
    setSelectedClip(clip)

    trackEvent({
      event_name: 'clip_preview_clicked',
      properties: { clip_id: clip.id, episode_id: episodeId },
    })

    setTimeout(() => setLoadingVideo(null), 500)
  }

  const getViralityColor = (score?: number) => {
    if (!score) return 'text-nova-muted'
    if (score >= 8) return 'text-red-500'
    if (score >= 6) return 'text-orange-500'
    return 'text-yellow-500'
  }

  const getViralityBgColor = (score?: number) => {
    if (!score) return 'bg-nova-muted/20'
    if (score >= 8) return 'bg-red-500/20'
    if (score >= 6) return 'bg-orange-500/20'
    return 'bg-yellow-500/20'
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-display text-white">Generated Clips</h3>
          <p className="text-sm text-nova-muted mt-1">{clips.length} moment{clips.length !== 1 ? 's' : ''} extracted</p>
        </div>
        {onGenerateMore && (
          <button
            onClick={onGenerateMore}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg bg-nova-teal text-white text-sm font-body hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} />}
            Generate More
          </button>
        )}
      </div>

      {clips.length === 0 ? (
        <div className="text-center py-8 text-nova-muted">
          <p>No clips generated yet. Generate clips from transcripts to get started.</p>
        </div>
      ) : (
        <>
          {/* Clips Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedClips.map(clip => (
              <div
                key={clip.id}
                className="group relative rounded-lg overflow-hidden bg-nova-navydark border border-nova-muted hover:border-nova-gold transition-all cursor-pointer"
                onClick={() => handlePlayClip(clip)}>
                {/* Thumbnail */}
                <div className="aspect-video bg-nova-muted/20 relative overflow-hidden">
                  {clip.thumbnail_url ? (
                    <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play size={32} className="text-nova-muted/50" />
                    </div>
                  )}

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all">
                    <Play size={40} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                  </div>

                  {/* Status Badge */}
                  {clip.status === 'generating' && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-nova-gold/90 text-nova-navy text-xs font-body flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" />
                      Generating
                    </div>
                  )}

                  {clip.status === 'failed' && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-nova-crimson/90 text-white text-xs font-body flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Failed
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  <h4 className="font-display text-sm text-white line-clamp-2 group-hover:text-nova-gold transition-colors">
                    {clip.title}
                  </h4>

                  {/* Virality Score */}
                  {clip.virality_score !== undefined && (
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${getViralityBgColor(clip.virality_score)}`}>
                      <Flame size={14} className={getViralityColor(clip.virality_score)} />
                      <span className={`text-xs font-body ${getViralityColor(clip.virality_score)}`}>
                        {clip.virality_score.toFixed(1)}/10
                      </span>
                    </div>
                  )}

                  {/* Duration */}
                  <p className="text-xs text-nova-muted">
                    {Math.round((clip.end_time - clip.start_time) / 1000)}s clip
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Video Preview Modal */}
          {selectedClip && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedClip(null)}>
              <div
                className="w-full max-w-2xl rounded-lg overflow-hidden bg-nova-navydark border border-nova-gold"
                onClick={e => e.stopPropagation()}>
                <div className="aspect-video bg-black flex items-center justify-center relative">
                  {loadingVideo === selectedClip.id ? (
                    <Loader2 size={40} className="text-nova-gold animate-spin" />
                  ) : selectedClip.video_url ? (
                    <video src={selectedClip.video_url} controls className="w-full h-full" autoPlay />
                  ) : (
                    <div className="text-center">
                      <AlertTriangle size={40} className="text-nova-muted mx-auto mb-2" />
                      <p className="text-nova-muted text-sm">Video not available yet</p>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-display text-lg text-white">{selectedClip.title}</h3>
                    {selectedClip.virality_score !== undefined && (
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full mt-2 ${getViralityBgColor(selectedClip.virality_score)}`}>
                        <Flame size={16} className={getViralityColor(selectedClip.virality_score)} />
                        <span className={`text-sm font-body ${getViralityColor(selectedClip.virality_score)}`}>
                          Virality Score: {selectedClip.virality_score.toFixed(1)}/10
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedClip.key_moments && selectedClip.key_moments.length > 0 && (
                    <div>
                      <p className="text-xs text-nova-muted uppercase font-body mb-1">Why it's viral:</p>
                      <p className="text-sm text-white">{selectedClip.key_moments[0]}</p>
                    </div>
                  )}

                  <button
                    onClick={() => setSelectedClip(null)}
                    className="w-full px-4 py-2 rounded-lg bg-nova-gold text-nova-navy font-body text-sm hover:brightness-110 transition-all">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
