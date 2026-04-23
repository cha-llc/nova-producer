import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, AlertTriangle } from 'lucide-react'
import { AiEpisode, Transcript, VideoClip, AudioFile } from '../types'
import { supabase } from '../lib/supabase'
import { apiCall, logger } from '../lib/error-handling'
import AudioUpload from '../components/AudioUpload'
import ClipsGallery from '../components/ClipsGallery'
import AnalyticsDashboard from '../components/AnalyticsDashboard'

export default function AudioAndClips() {
  const [searchParams] = useSearchParams()
  const episodeId = searchParams.get('episode_id') || ''
  const showId = searchParams.get('show_id') || ''

  const [episode, setEpisode] = useState<AiEpisode | null>(null)
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [clips, setClips] = useState<VideoClip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingClips, setGeneratingClips] = useState(false)

  useEffect(() => {
    if (episodeId && showId) {
      loadEpisodeData()
    }
  }, [episodeId, showId])

  const loadEpisodeData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch episode
      const { data: epData, error: epError } = await supabase
        .from('ai_episodes')
        .select('*')
        .eq('id', episodeId)
        .eq('show_id', showId)
        .single()

      if (epError || !epData) {
        setError('Episode not found')
        setLoading(false)
        return
      }

      setEpisode(epData)

      // Fetch audio file
      const { data: audioData } = await supabase
        .from('audio_files')
        .select('*')
        .eq('episode_id', episodeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (audioData) {
        setAudioFile(audioData)

        // Fetch transcript if audio is transcribed
        if (audioData.status === 'transcribed') {
          const { data: transcriptData } = await supabase
            .from('transcripts')
            .select('*')
            .eq('audio_id', audioData.id)
            .single()

          if (transcriptData) {
            setTranscript(transcriptData)
          }
        }
      }

      // Fetch clips
      const { data: clipsData } = await supabase
        .from('video_clips')
        .select('*')
        .eq('episode_id', episodeId)
        .order('virality_score', { ascending: false })

      if (clipsData) {
        setClips(clipsData)
      }
    } catch (err) {
      logger.error('Failed to load episode data', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleAudioUploadComplete = (uploadedAudio: AudioFile) => {
    setAudioFile(uploadedAudio)

    // Start transcription
    transcribeAudio(uploadedAudio.id)
  }

  const transcribeAudio = async (audioId: string) => {
    try {
      await apiCall('/api/transcribe-audio', {
        method: 'POST',
        body: JSON.stringify({
          audio_file_id: audioId,
          show_id: showId,
        }),
        operationName: 'Transcribe audio',
      })

      // Reload to get updated transcript
      await loadEpisodeData()
    } catch (err) {
      logger.error('Transcription failed', err)
      setError('Transcription failed. Please try again.')
    }
  }

  const handleGenerateClips = async () => {
    if (!transcript) {
      setError('Transcript required to generate clips')
      return
    }

    setGeneratingClips(true)
    try {
      const result = await apiCall('/api/generate-clips', {
        method: 'POST',
        body: JSON.stringify({
          episode_id: episodeId,
          show_id: showId,
          use_transcript: true,
        }),
        operationName: 'Generate clips',
      })

      // Update clips list
      if (result.clips) {
        setClips(prev => [...prev, ...result.clips])
      }
    } catch (err) {
      logger.error('Clip generation failed', err)
      setError('Failed to generate clips. Please try again.')
    } finally {
      setGeneratingClips(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={40} className="text-nova-gold animate-spin" />
      </div>
    )
  }

  if (!episodeId || !showId) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle size={48} className="text-nova-crimson mx-auto mb-4" />
        <p className="text-white text-lg">Episode not found</p>
        <p className="text-nova-muted mt-2">Please select an episode to continue</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-display text-white mb-2">{episode?.episode_title || 'Audio & Clips'}</h1>
        <p className="text-nova-muted">Upload audio, generate transcripts, and extract viral clips</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-nova-crimson/10 border border-nova-crimson flex items-start gap-3">
          <AlertTriangle size={20} className="text-nova-crimson flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-nova-crimson font-body">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-nova-crimson hover:underline mt-1">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Audio Upload Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-display text-white">Step 1: Upload Audio</h2>
        
        {audioFile ? (
          <div className="p-4 rounded-lg bg-nova-navy border border-nova-gold">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-white">{audioFile.file_name}</p>
                <p className="text-xs text-nova-muted mt-1">
                  {(audioFile.file_size / 1024 / 1024).toFixed(2)}MB • Status: {audioFile.status}
                </p>
              </div>
              {audioFile.status === 'transcribing' && <Loader2 size={20} className="text-nova-gold animate-spin" />}
            </div>
          </div>
        ) : (
          <AudioUpload showId={showId} episodeId={episodeId} onUploadComplete={handleAudioUploadComplete} />
        )}
      </div>

      {/* Transcript Section */}
      {audioFile && (
        <div className="space-y-4">
          <h2 className="text-2xl font-display text-white">Step 2: Transcript</h2>
          
          {audioFile.status === 'transcribed' && transcript ? (
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted max-h-96 overflow-y-auto">
              <p className="text-sm text-white leading-relaxed">{transcript.full_text}</p>
              <p className="text-xs text-nova-muted mt-3">{transcript.word_count} words</p>
            </div>
          ) : audioFile.status === 'transcribing' ? (
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted flex items-center gap-3">
              <Loader2 size={20} className="text-nova-gold animate-spin" />
              <p className="text-white">Transcribing audio...</p>
            </div>
          ) : audioFile.status === 'failed' ? (
            <div className="p-4 rounded-lg bg-nova-crimson/10 border border-nova-crimson">
              <p className="text-nova-crimson text-sm">{audioFile.error_msg || 'Transcription failed'}</p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted text-center text-nova-muted">
              <p>Waiting for audio to be uploaded...</p>
            </div>
          )}
        </div>
      )}

      {/* Clips Generation Section */}
      {transcript && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-display text-white">Step 3: Generate Clips</h2>
            {clips.length > 0 && (
              <button
                onClick={handleGenerateClips}
                disabled={generatingClips}
                className="px-4 py-2 rounded-lg bg-nova-gold text-nova-navy text-sm font-body hover:brightness-110 transition-all disabled:opacity-50">
                {generatingClips ? 'Generating...' : 'Generate More'}
              </button>
            )}
          </div>

          {clips.length === 0 && (
            <button
              onClick={handleGenerateClips}
              disabled={generatingClips}
              className="w-full px-6 py-4 rounded-lg bg-nova-teal text-white font-display text-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {generatingClips ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Generating Clips...
                </>
              ) : (
                '🔥 Generate Viral Clips'
              )}
            </button>
          )}

          {clips.length > 0 && <ClipsGallery clips={clips} episodeId={episodeId} />}
        </div>
      )}

      {/* Analytics Section */}
      {episode && (
        <div className="space-y-4">
          <h2 className="text-2xl font-display text-white">Performance Analytics</h2>
          <AnalyticsDashboard episodeId={episodeId} showId={showId} />
        </div>
      )}
    </div>
  )
}
