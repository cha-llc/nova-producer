import { useState, useRef } from 'react'
import { Upload, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { AudioFile } from '../types'
import { logger } from '../lib/error-handling'
import { trackEvent } from '../lib/error-handling'

interface AudioUploadProps {
  showId: string
  episodeId?: string
  onUploadComplete: (audioFile: AudioFile) => void
}

export default function AudioUpload({ showId, episodeId, onUploadComplete }: AudioUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (file: File) => {
    setError(null)
    setSuccess(false)

    // Validation
    if (!file.type.startsWith('audio/')) {
      setError('Please select an audio file (MP3, WAV, M4A, etc.)')
      return
    }

    if (file.size > 500 * 1024 * 1024) {
      setError('File is too large. Maximum size is 500MB')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      trackEvent({
        event_name: 'audio_upload_started',
        show_id: showId,
        episode_id: episodeId,
        properties: { file_size: file.size, file_type: file.type },
      })

      // Upload to Supabase Storage
      const fileName = `${showId}/${Date.now()}_${file.name}`
      
      const { data, error: uploadError } = await fetch(
        `/api/upload-audio`,
        {
          method: 'POST',
          body: JSON.stringify({
            file_name: fileName,
            file_size: file.size,
            content_type: file.type,
          }),
          headers: { 'Content-Type': 'application/json' },
        }
      ).then(r => r.json())

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError}`)
      }

      // Upload file to signed URL
      const uploadUrl = data.signed_url
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file')
      }

      setProgress(100)
      setSuccess(true)

      // Get the public URL
      const fileUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/audio-files/${fileName}`

      // Save metadata to database
      const audioFile: AudioFile = {
        id: data.file_id,
        show_id: showId,
        episode_id: episodeId,
        file_name: file.name,
        file_size: file.size,
        duration_seconds: 0, // Will be calculated by transcription service
        s3_url: fileUrl,
        status: 'uploaded',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      onUploadComplete(audioFile)

      trackEvent({
        event_name: 'audio_upload_completed',
        show_id: showId,
        episode_id: episodeId,
        properties: { file_id: audioFile.id },
      })

      // Auto-clear success after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      setError(errorMsg)
      logger.error('Audio upload failed', err, { showId, episodeId })

      trackEvent({
        event_name: 'audio_upload_failed',
        show_id: showId,
        episode_id: episodeId,
        properties: { error: errorMsg },
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('border-nova-gold', 'bg-nova-gold/5')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('border-nova-gold', 'bg-nova-gold/5')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('border-nova-gold', 'bg-nova-gold/5')
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
          uploading ? 'border-nova-gold bg-nova-gold/10' : 'border-nova-muted hover:border-nova-gold'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={e => e.target.files && handleFileSelect(e.target.files[0])}
          disabled={uploading}
        />

        {!uploading && !success && (
          <>
            <Upload size={48} className="text-nova-gold mx-auto mb-4" />
            <p className="text-white font-display text-lg mb-2">Drop audio file here</p>
            <p className="text-nova-muted text-sm mb-4">or</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-nova-gold text-nova-navy font-body text-sm hover:brightness-110 transition-all">
              Select File
            </button>
            <p className="text-nova-muted text-xs mt-4">Max 500MB • MP3, WAV, M4A supported</p>
          </>
        )}

        {uploading && (
          <>
            <Loader2 size={48} className="text-nova-gold mx-auto mb-4 animate-spin" />
            <p className="text-white font-display text-lg mb-2">Uploading...</p>
            <div className="w-full bg-nova-muted rounded-full h-2 mb-2">
              <div className="bg-nova-gold h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-nova-muted text-sm">{progress}%</p>
          </>
        )}

        {success && (
          <>
            <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
            <p className="text-white font-display text-lg">Upload Complete</p>
            <p className="text-nova-muted text-sm mt-2">Transcription starting...</p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-nova-crimson/10 border border-nova-crimson flex items-start gap-3">
          <AlertTriangle size={20} className="text-nova-crimson flex-shrink-0 mt-0.5" />
          <p className="text-nova-crimson text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
