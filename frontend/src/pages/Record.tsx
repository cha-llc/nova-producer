import GuestGate from '../components/GuestGate'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Video, VideoOff, Mic, MicOff, Play, Square, Pause, Upload,
  RefreshCw, ChevronLeft, ChevronRight, Check, Loader2, Camera,
  FileText, SkipBack, SkipForward, Scissors, AlertCircle, Download,
  Radio, Image as ImageIcon, X
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string

interface ShowConfig {
  id: string
  show_name: string
  color: string
}
interface Script {
  id: string
  part_title: string
  script_text: string
  show_id: string
  series_topic?: string
  series_part?: number
  post_date?: string
  status?: string
  caption?: string
}

interface TextLayer {
  id: string
  text: string
  x: number   // center x as % of canvas width (0-100)
  y: number   // center y as % of canvas height (0-100)
  fontSize: number  // in canvas-space px (canvas=1080)
  color: string
  bold: boolean
  shadow: boolean
}

type Stage = 'setup' | 'recording' | 'review' | 'uploading' | 'done'

const SHOW_LABELS: Record<string, string> = {
  sunday_power_hour: 'Sunday Power Hour',
  motivation_court:  'Motivation Court',
  tea_time_with_cj:  'Tea Time with CJ',
  confession_court:  'Confession Court',
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function Record() {
  const [cameras, setCameras]       = useState<MediaDeviceInfo[]>([])
  const [mics, setMics]             = useState<MediaDeviceInfo[]>([])
  const [camId, setCamId]           = useState('')
  const [micId, setMicId]           = useState('')
  const [camOn, setCamOn]           = useState(true)
  const [micOn, setMicOn]           = useState(true)
  const [mirrored, setMirrored]     = useState(true)
  const [thumbnailMode, setThumbnailMode] = useState(false)
  const [thumbnailUrl, setThumbnailUrl]   = useState('')
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbLoading, setThumbLoading]   = useState(false)
  const [textLayers, setTextLayers]         = useState<TextLayer[]>([])
  const [selectedLayer, setSelectedLayer]   = useState<string | null>(null)

  const [shows, setShows]           = useState<ShowConfig[]>([])
  const [scripts, setScripts]       = useState<Script[]>([])
  const [showId, setShowId]         = useState('')
  const [scriptId, setScriptId]     = useState('')
  const [title, setTitle]           = useState('')
  const [teleprompter, setTeleprompter] = useState(false)
  const [fontSize, setFontSize]     = useState(24)

  const [stage, setStage]           = useState<Stage>('setup')
  const [countdown, setCountdown]   = useState(0)
  const [elapsed, setElapsed]       = useState(0)
  const [paused, setPaused]         = useState(false)

  const [duration, setDuration]     = useState(0)
  const [trimStart, setTrimStart]   = useState(0)
  const [trimEnd, setTrimEnd]       = useState(0)
  const [previewTime, setPreviewTime] = useState(0)

  const [reviewBlobUrl, setReviewBlobUrl]   = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [episodeId, setEpisodeId]   = useState('')
  const [error, setError]           = useState('')

  const previewRef    = useRef<HTMLVideoElement>(null)
  const reviewRef     = useRef<HTMLVideoElement>(null)
  const thumbImgRef        = useRef<HTMLImageElement>(null)
  const thumbPreloadRef    = useRef<HTMLImageElement | null>(null)  // persists across stage changes
  const thumbContainerRef  = useRef<HTMLDivElement>(null)
  const dragState          = useRef<{ layerId: string; startMouseX: number; startMouseY: number; startLayerX: number; startLayerY: number } | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const recorderRef   = useRef<MediaRecorder | null>(null)
  const chunksRef     = useRef<Blob[]>([])
  const blobRef       = useRef<Blob | null>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const trimBarRef    = useRef<HTMLDivElement>(null)
  const dragging      = useRef<'start' | 'end' | null>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)

  // Load devices
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then(devs => {
        const cams = devs.filter(d => d.kind === 'videoinput')
        const mics2 = devs.filter(d => d.kind === 'audioinput')
        setCameras(cams)
        setMics(mics2)
        if (cams.length) setCamId(cams[0].deviceId)
        if (mics2.length) setMicId(mics2[0].deviceId)
      })
      .catch(() => setError('Camera/mic access denied. Please allow in browser settings, then refresh.'))
  }, [])

  // Load shows + scripts
  useEffect(() => {
    supabase.from('show_configs').select('id,show_name,color').then(({ data }) => {
      setShows(data ?? [])
      if (data?.length) setShowId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!showId) return
    supabase.from('show_scripts')
      .select('id,part_title,script_text,show_id,series_topic,series_part,post_date,status,caption')
      .eq('show_id', showId)
      .order('post_date', { ascending: true })
      .order('series_part', { ascending: true })
      .then(({ data }) => {
        setScripts(data ?? [])
        setScriptId('')
      })
  }, [showId])


  // Text layer helpers
  function addTextLayer() {
    const id = Math.random().toString(36).slice(2, 10)
    const show = shows.find(s => s.id === showId)
    const defaultText = show ? (SHOW_LABELS[show.show_name] || show.show_name.replace(/_/g,' ').toUpperCase()) : 'Text'
    setTextLayers(prev => [...prev, { id, text: defaultText, x: 50, y: 85, fontSize: 80, color: '#ffffff', bold: true, shadow: true }])
    setSelectedLayer(id)
  }
  function updateLayer(id: string, patch: Partial<TextLayer>) {
    setTextLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function deleteLayer(id: string) {
    setTextLayers(prev => prev.filter(l => l.id !== id))
    if (selectedLayer === id) setSelectedLayer(null)
  }
  function handleLayerMouseDown(e: React.MouseEvent, layerId: string) {
    e.stopPropagation(); e.preventDefault()
    setSelectedLayer(layerId)
    const layer = textLayers.find(l => l.id === layerId)
    if (!layer) { dragState.current = null; return }
    dragState.current = { layerId, startMouseX: e.clientX, startMouseY: e.clientY, startLayerX: layer.x, startLayerY: layer.y }
  }
  function handleContainerMouseMove(e: React.MouseEvent) {
    if (!dragState.current || !thumbContainerRef.current) return
    // Capture all values synchronously — dragState.current may be null by the time
    // the setTextLayers batch callback executes (if onMouseLeave fires during drag)
    const { layerId, startMouseX, startMouseY, startLayerX, startLayerY } = dragState.current
    const rect = thumbContainerRef.current.getBoundingClientRect()
    const dx = (e.clientX - startMouseX) / rect.width * 100
    const dy = (e.clientY - startMouseY) / rect.height * 100
    const newX = Math.max(2, Math.min(98, startLayerX + dx))
    const newY = Math.max(2, Math.min(98, startLayerY + dy))
    setTextLayers(prev => prev.map(l => l.id === layerId ? { ...l, x: newX, y: newY } : l))
  }
  function handleContainerMouseUp() { dragState.current = null }
  function handleLayerMouseUp(e: React.MouseEvent) { e.stopPropagation(); dragState.current = null }

  // Pre-load thumbnail image into a persistent ref so it survives stage changes
  useEffect(() => {
    if (!thumbnailUrl) { thumbPreloadRef.current = null; return }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { thumbPreloadRef.current = img }
    img.onerror = () => { thumbPreloadRef.current = null }
    img.src = thumbnailUrl
  }, [thumbnailUrl])

  // Auto-load thumbnail when thumbnail mode is toggled on
  useEffect(() => {
    if (!thumbnailMode || !showId) return
    // Don't overwrite a manually uploaded file
    if (thumbnailFile) return
    setThumbLoading(true)
    const SB = import.meta.env.VITE_SUPABASE_URL as string
    fetch(`${SB}/functions/v1/record-thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_id: showId, script_id: scriptId || null }),
    })
      .then(r => r.json())
      .then((d: { url?: string | null; source?: string }) => {
        if (d.url) setThumbnailUrl(d.url)
      })
      .catch(() => {})
      .finally(() => setThumbLoading(false))
  }, [thumbnailMode, showId, scriptId])  // eslint-disable-line

  const startPreview = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (thumbnailMode) {
      // Only get mic for thumbnail mode
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: micOn ? { deviceId: micId ? { exact: micId } : undefined } : false,
        })
        streamRef.current = stream
      } catch { /* mic might not be available */ }
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camOn ? { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: micOn ? { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } : false,
      })
      streamRef.current = stream
      if (previewRef.current) {
        previewRef.current.srcObject = stream
        previewRef.current.muted = true
        previewRef.current.play().catch(() => {})
      }
    } catch (e) {
      setError(`Camera/mic error: ${String(e)}`)
    }
  }, [camOn, camId, micOn, micId, thumbnailMode])

  useEffect(() => {
    if (stage === 'setup') startPreview()
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [stage, startPreview])

  useEffect(() => {
    if (!streamRef.current) return
    streamRef.current.getVideoTracks().forEach(t => { t.enabled = camOn })
    streamRef.current.getAudioTracks().forEach(t => { t.enabled = micOn })
  }, [camOn, micOn])

  const handleThumbnailFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setThumbnailFile(f)
    const url = URL.createObjectURL(f)
    setThumbnailUrl(url)
  }

  const startRecording = async () => {
    setError('')
    setStage('recording')
    setPaused(false)
    setElapsed(0)
    chunksRef.current = []

    // 3-2-1 countdown
    for (let i = 3; i > 0; i--) {
      setCountdown(i)
      await new Promise(r => setTimeout(r, 1000))
    }
    setCountdown(0)

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4'

    let recordStream: MediaStream

    if (thumbnailMode) {
      // Thumbnail mode: static image on canvas + mic audio
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1080
      const ctx = canvas.getContext('2d')!

      // Use pre-loaded image ref (survives stage DOM changes)
      const img = thumbPreloadRef.current
      const drawThumbnail = () => {
        if (img && img.complete) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          // Draw text layers
          for (const layer of textLayers) {
            const lx = (layer.x / 100) * canvas.width
            const ly = (layer.y / 100) * canvas.height
            ctx.font = `${layer.bold ? 'bold ' : ''}${layer.fontSize}px Poppins, Arial, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            if (layer.shadow) {
              ctx.shadowColor = 'rgba(0,0,0,0.85)'
              ctx.shadowBlur = 10
              ctx.shadowOffsetX = 2
              ctx.shadowOffsetY = 2
            }
            ctx.fillStyle = layer.color
            ctx.fillText(layer.text, lx, ly)
            ctx.shadowColor = 'transparent'
            ctx.shadowBlur = 0
            ctx.shadowOffsetX = 0
            ctx.shadowOffsetY = 0
          }
        } else {
          ctx.fillStyle = '#1A1A2E'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#C9A84C'
          ctx.font = 'bold 48px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('🎙 Audio Recording', canvas.width / 2, canvas.height / 2)
        }
        requestAnimationFrame(drawThumbnail)
      }
      drawThumbnail()

      recordStream = canvas.captureStream(30)

      // Get a FRESH mic stream here — setStage('recording') earlier in this function
      // triggers the useEffect cleanup which stops streamRef.current tracks before
      // the canvas recording setup runs. Acquiring audio independently avoids that race.
      if (micOn) {
        try {
          const freshMic = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
          })
          freshMic.getAudioTracks().forEach(t => recordStream.addTrack(t))
        } catch (e) {
          setError(`Mic error: ${String(e)}. Check browser mic permissions.`)
        }
      }
    } else {
      if (!streamRef.current) {
        setError('No camera/mic stream. Please refresh and allow access.')
        setStage('setup')
        return
      }
      recordStream = streamRef.current
    }

    const recorder = new MediaRecorder(recordStream, { mimeType })
    recorderRef.current = recorder
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      blobRef.current = blob
      const url = URL.createObjectURL(blob)
      setReviewBlobUrl(url)  // store in state; useEffect will set src once video renders
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      setStage('review')
    }

    recorder.start(250)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }

  const pauseResume = () => {
    if (!recorderRef.current) return
    if (paused) {
      recorderRef.current.resume()
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      recorderRef.current.pause()
      if (timerRef.current) clearInterval(timerRef.current)
    }
    setPaused(p => !p)
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    recorderRef.current?.stop()
  }

  // Trim drag
  const onTrimMouseDown = (handle: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = handle
    const onMove = (me: MouseEvent) => {
      if (!trimBarRef.current) return
      const rect = trimBarRef.current.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width))
      const t = pct * duration
      if (dragging.current === 'start') setTrimStart(Math.min(t, trimEnd - 0.5))
      else setTrimEnd(Math.max(t, trimStart + 0.5))
    }
    const onUp = () => {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const seekTo = (pct: number) => {
    if (!reviewRef.current || !duration) return
    const t = pct * duration
    reviewRef.current.currentTime = t
    setPreviewTime(t)
  }

  // Set review video src once stage switches to 'review' and video element exists
  useEffect(() => {
    if (stage !== 'review' || !reviewBlobUrl) return
    const v = reviewRef.current
    if (!v) return
    v.src = reviewBlobUrl
    v.onloadedmetadata = () => {
      const dur = v.duration ?? 0
      setDuration(dur)
      setTrimStart(0)
      setTrimEnd(dur)
    }
  }, [stage, reviewBlobUrl])

  useEffect(() => {
    const v = reviewRef.current
    if (!v) return
    const onTime = () => setPreviewTime(v.currentTime)
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [stage])

  const upload = async () => {
    if (!blobRef.current) return
    setStage('uploading')
    setError('')
    setUploadProgress(10)

    try {
      const selectedShow = shows.find(s => s.id === showId)
      const selectedScript = scripts.find(s => s.id === scriptId)
      const showName = selectedShow?.show_name || 'unknown_show'
      const episodeTitle = title || selectedScript?.part_title || 'Self-Recorded Episode'

      setUploadProgress(25)

      const blob = blobRef.current
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const filename = `self-recorded/${showName}/${Date.now()}.${ext}`

      const buffer = await blob.arrayBuffer()
      setUploadProgress(45)

      const { error: uploadErr } = await supabase.storage
        .from('newsletter-assets')
        .upload(filename, buffer, { contentType: blob.type, upsert: false })

      if (uploadErr) throw new Error(uploadErr.message)
      setUploadProgress(70)

      const { data: urlData } = supabase.storage.from('newsletter-assets').getPublicUrl(filename)
      const storageUrl = urlData.publicUrl

      // Upload thumbnail image if in thumbnail mode
      let thumbStorageUrl = ''
      if (thumbnailMode) {
        if (thumbnailFile) {
          // User uploaded a custom file — upload it
          const thumbExt = thumbnailFile.name.split('.').pop() || 'jpg'
          const thumbPath = `self-recorded/${showName}/thumb-${Date.now()}.${thumbExt}`
          const thumbBuf = await thumbnailFile.arrayBuffer()
          await supabase.storage.from('newsletter-assets')
            .upload(thumbPath, thumbBuf, { contentType: thumbnailFile.type, upsert: false })
          thumbStorageUrl = supabase.storage.from('newsletter-assets').getPublicUrl(thumbPath).data.publicUrl
        } else if (thumbnailUrl) {
          // Auto-loaded show thumbnail — already in Supabase Storage, use URL directly
          thumbStorageUrl = thumbnailUrl
        }
      }

      setUploadProgress(85)

      const { data: ep, error: epErr } = await supabase.from('ai_episodes').insert({
        show_name:      showName,
        episode_title:  episodeTitle,
        storage_url:    storageUrl,
        thumbnail_url:  thumbStorageUrl || null,
        status:         'complete',
        source:         'self_recorded',
        script_id:      scriptId || null,
        heygen_video_id: '',
      }).select().single()

      if (epErr) throw new Error(epErr.message)
      setUploadProgress(95)

      if (scriptId) {
        await supabase.from('show_scripts').update({ status: 'done' }).eq('id', scriptId)
      }

      setUploadProgress(100)
      setEpisodeId(ep.id)
      setStage('done')
    } catch (e) {
      setError(String(e))
      setStage('review')
    }
  }

  const reset = () => {
    blobRef.current = null
    chunksRef.current = []
    setStage('setup')
    setElapsed(0)
    setDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
    setPreviewTime(0)
    setError('')
    setEpisodeId('')
  }

  const selectedShowConfig = shows.find(s => s.id === showId)
  const selectedScript = scripts.find(s => s.id === scriptId)
  const showColor = selectedShowConfig?.color || '#C9A84C'
  const isTrimmed = trimStart > 0.1 || (duration > 0 && trimEnd < duration - 0.1)

  return (
    <GuestGate pageName="Record">
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
            <Camera size={28} className="text-nova-gold" /> RECORD
          </h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            Record directly — no HeyGen, no avatar required.
          </p>
        </div>
        {stage !== 'setup' && stage !== 'uploading' && (
          <button onClick={reset} className="nova-btn-ghost flex items-center gap-2 text-sm">
            <RefreshCw size={13} /> New Recording
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-nova-crimson/10 border border-nova-crimson/30 flex items-start gap-2">
          <AlertCircle size={14} className="text-nova-crimson mt-0.5 shrink-0" />
          <p className="text-xs font-mono text-nova-crimson">{error}</p>
        </div>
      )}

      {/* ── SETUP ── */}
      {stage === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Preview area */}
          <div className="lg:col-span-2 space-y-3">

            {/* Thumbnail mode toggle banner */}
            <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${thumbnailMode ? 'border-nova-gold/40 bg-nova-gold/5' : 'border-nova-border/40'}`}>
              <div className="flex items-center gap-3">
                <ImageIcon size={16} className={thumbnailMode ? 'text-nova-gold' : 'text-nova-muted'} />
                <div>
                  <p className={`text-sm font-body ${thumbnailMode ? 'text-nova-gold' : 'text-white'}`}>
                    {thumbnailMode ? 'Thumbnail Mode — Camera hidden, audio only' : 'Camera Mode — You on screen'}
                  </p>
                  <p className="text-xs font-mono text-nova-muted">
                    {thumbnailMode ? 'Your voice + a static image will be recorded' : 'Toggle to hide yourself from camera'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setThumbnailMode(v => !v); if (thumbnailMode) { setThumbnailUrl(''); setThumbnailFile(null) } }}
                className={`relative w-12 h-6 rounded-full transition-all ${thumbnailMode ? 'bg-nova-gold' : 'bg-nova-border'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${thumbnailMode ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {thumbnailMode ? (
              /* Thumbnail mode preview — drag-to-position multi-layer text editor */
              <>
              {/* Square canvas preview (matches 1080×1080 recording canvas) */}
              <div
                ref={thumbContainerRef}
                className="relative rounded-2xl overflow-hidden bg-nova-navydark border border-nova-gold/20 w-full select-none"
                style={{ aspectRatio: '1/1', cursor: dragState.current ? 'grabbing' : 'default' }}
                onMouseMove={handleContainerMouseMove}
                onMouseUp={handleContainerMouseUp}
                onMouseLeave={handleContainerMouseUp}
                onClick={() => setSelectedLayer(null)}
              >
                {thumbnailUrl ? (
                  <>
                    <img
                      ref={thumbImgRef}
                      src={thumbnailUrl}
                      alt="thumbnail"
                      className="absolute inset-0 w-full h-full object-cover opacity-80"
                      crossOrigin="anonymous"
                    />
                    {/* Draggable text layers */}
                    {textLayers.map(layer => {
                      const containerH = thumbContainerRef.current?.clientHeight || 400
                      const displayFontSize = Math.max(8, Math.round(layer.fontSize * (containerH / 1080)))
                      return (
                        <div
                          key={layer.id}
                          onMouseDown={e => handleLayerMouseDown(e, layer.id)}
                          onMouseUp={handleLayerMouseUp}
                          style={{
                            position: 'absolute',
                            left: `${layer.x}%`,
                            top: `${layer.y}%`,
                            transform: 'translate(-50%, -50%)',
                            cursor: 'grab',
                            fontWeight: layer.bold ? 'bold' : 'normal',
                            fontSize: `${displayFontSize}px`,
                            color: layer.color,
                            textShadow: layer.shadow ? '2px 2px 6px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.6)' : 'none',
                            fontFamily: 'Poppins, Arial, sans-serif',
                            whiteSpace: 'nowrap',
                            outline: selectedLayer === layer.id ? `2px dashed rgba(201,168,76,0.9)` : '2px dashed transparent',
                            outlineOffset: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            zIndex: 20,
                            lineHeight: 1.2,
                          }}
                        >
                          {layer.text || ' '}
                        </div>
                      )
                    })}
                    {/* Mic indicator */}
                    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/50">
                      <Mic size={12} className="text-nova-gold" />
                      <span className="text-[10px] font-mono text-nova-gold">Audio</span>
                    </div>
                    <button
                      onClick={() => { setThumbnailUrl(''); setThumbnailFile(null) }}
                      className="absolute top-3 right-3 z-30 p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-all">
                      <X size={14} className="text-white" />
                    </button>
                    {textLayers.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <p className="text-nova-muted/60 font-mono text-xs bg-black/30 px-3 py-1 rounded">Add text layers below</p>
                      </div>
                    )}
                  </>
                ) : thumbLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="text-nova-gold animate-spin" />
                    <p className="text-nova-gold font-mono text-sm">Loading show thumbnail...</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-nova-gold/10 border border-nova-gold/30 flex items-center justify-center">
                      <ImageIcon size={28} className="text-nova-gold/60" />
                    </div>
                    <p className="text-nova-muted font-mono text-sm">No thumbnail found — upload one</p>
                    <button
                      onClick={() => thumbInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-nova-gold/40 text-nova-gold text-sm hover:bg-nova-gold/10 transition-all">
                      <Upload size={14} /> Choose Image
                    </button>
                    <input ref={thumbInputRef} type="file" accept="image/*" className="hidden" onChange={handleThumbnailFile} />
                  </div>
                )}
              </div>

              {/* Text layer controls */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">Text Layers</p>
                  <button
                    onClick={addTextLayer}
                    className="flex items-center gap-1.5 text-xs font-mono text-nova-gold border border-nova-gold/30 px-3 py-1 rounded-lg hover:bg-nova-gold/10 transition-all">
                    + Add Text
                  </button>
                </div>

                {textLayers.length === 0 && (
                  <p className="text-[10px] font-mono text-nova-muted py-1">No text layers. Click "+ Add Text" to add one.</p>
                )}

                {textLayers.map((layer, i) => (
                  <div
                    key={layer.id}
                    className={`p-2.5 rounded-xl border transition-all ${selectedLayer === layer.id ? 'border-nova-gold/50 bg-nova-gold/5' : 'border-nova-border/40 hover:border-nova-border/70'}`}
                    onClick={() => setSelectedLayer(layer.id)}
                  >
                    {/* Row 1: label + text input + delete */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-nova-muted w-4 flex-shrink-0">#{i+1}</span>
                      <input
                        type="text"
                        value={layer.text}
                        onChange={e => updateLayer(layer.id, { text: e.target.value })}
                        className="nova-input text-sm flex-1 py-1"
                        placeholder="Text..."
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        onClick={e => { e.stopPropagation(); deleteLayer(layer.id) }}
                        className="p-1 rounded text-nova-muted hover:text-nova-crimson transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                    {/* Row 2: size + color + bold + shadow + position */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-nova-muted">Size</span>
                        <input
                          type="number"
                          value={layer.fontSize}
                          onChange={e => updateLayer(layer.id, { fontSize: Math.max(16, Math.min(400, Number(e.target.value))) })}
                          className="nova-input text-xs w-16 py-0.5 px-1.5"
                          min={16} max={400}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-nova-muted">Color</span>
                        <input
                          type="color"
                          value={layer.color}
                          onChange={e => updateLayer(layer.id, { color: e.target.value })}
                          className="w-7 h-6 rounded cursor-pointer p-0 border-0"
                          style={{ background: 'none' }}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); updateLayer(layer.id, { bold: !layer.bold }) }}
                        className={`text-xs font-bold px-2 py-0.5 rounded transition-all ${layer.bold ? 'bg-nova-gold/20 text-nova-gold' : 'text-nova-muted border border-nova-border/40 hover:text-white'}`}>
                        B
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); updateLayer(layer.id, { shadow: !layer.shadow }) }}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded transition-all ${layer.shadow ? 'bg-nova-teal/20 text-nova-teal' : 'text-nova-muted border border-nova-border/40 hover:text-white'}`}>
                        Shadow
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px] font-mono text-nova-muted">X</span>
                        <input
                          type="number"
                          value={Math.round(layer.x)}
                          onChange={e => updateLayer(layer.id, { x: Math.max(0, Math.min(100, Number(e.target.value))) })}
                          className="nova-input text-xs w-12 py-0.5 px-1.5"
                          min={0} max={100}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="text-[10px] font-mono text-nova-muted">Y</span>
                        <input
                          type="number"
                          value={Math.round(layer.y)}
                          onChange={e => updateLayer(layer.id, { y: Math.max(0, Math.min(100, Number(e.target.value))) })}
                          className="nova-input text-xs w-12 py-0.5 px-1.5"
                          min={0} max={100}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {textLayers.length > 0 && (
                  <p className="text-[10px] font-mono text-nova-muted">Drag text on image to reposition · All layers baked into recording</p>
                )}
              </div>
              </>
            ) : (
              /* Camera preview */
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-nova-border/40">
                <video ref={previewRef} autoPlay muted playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }} />
                {!camOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-nova-navydark/80">
                    <VideoOff size={40} className="text-nova-muted" />
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <button onClick={() => setCamOn(v => !v)}
                    className={`p-2 rounded-full transition-all ${camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-nova-crimson/80'}`}>
                    {camOn ? <Video size={16} className="text-white" /> : <VideoOff size={16} className="text-white" />}
                  </button>
                  <button onClick={() => setMicOn(v => !v)}
                    className={`p-2 rounded-full transition-all ${micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-nova-crimson/80'}`}>
                    {micOn ? <Mic size={16} className="text-white" /> : <MicOff size={16} className="text-white" />}
                  </button>
                  <button onClick={() => setMirrored(v => !v)}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all" title="Mirror">
                    <RefreshCw size={16} className="text-white" />
                  </button>
                </div>
              </div>
            )}

            {/* Mic indicator in thumbnail mode */}
            {thumbnailMode && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-nova-border/40">
                <button onClick={() => setMicOn(v => !v)}
                  className={`p-2 rounded-full transition-all ${micOn ? 'bg-nova-teal/20 border border-nova-teal/40' : 'bg-nova-crimson/20 border border-nova-crimson/40'}`}>
                  {micOn ? <Mic size={16} className="text-nova-teal" /> : <MicOff size={16} className="text-nova-crimson" />}
                </button>
                <span className="text-sm font-mono text-nova-muted">
                  Microphone: <span className={micOn ? 'text-nova-teal' : 'text-nova-crimson'}>{micOn ? 'On' : 'Off'}</span>
                </span>
              </div>
            )}

            {/* Teleprompter */}
            {teleprompter && selectedScript && (
              <div className="nova-card relative max-h-48 overflow-y-auto" style={{ borderColor: `${showColor}40` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Teleprompter</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setFontSize(s => Math.max(14, s - 2))} className="text-nova-muted hover:text-white text-xs px-1">A-</button>
                    <button onClick={() => setFontSize(s => Math.min(40, s + 2))} className="text-nova-muted hover:text-white text-xs px-1">A+</button>
                  </div>
                </div>
                <p className="text-white leading-relaxed whitespace-pre-wrap font-body"
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}>
                  {selectedScript.script_text}
                </p>
              </div>
            )}
          </div>

          {/* Setup panel */}
          <div className="space-y-4">
            <div className="nova-card space-y-4">
              <div>
                <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-2 block">Show</label>
                <select value={showId} onChange={e => setShowId(e.target.value)} className="nova-input text-sm w-full">
                  {shows.map(s => <option key={s.id} value={s.id}>{SHOW_LABELS[s.show_name] || s.show_name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-2 block">
                  Script <span className="text-nova-muted/50">(optional)</span>
                </label>
                <select value={scriptId} onChange={e => setScriptId(e.target.value)} className="nova-input text-sm w-full">
                  <option value="">— No script —</option>
                  {scripts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.status && s.status !== 'draft' ? `[${s.status}] ` : ''}{s.part_title}
                    </option>
                  ))}
                </select>
                {scriptId && (
                  <button onClick={() => setTeleprompter(v => !v)}
                    className={`mt-2 text-xs font-mono flex items-center gap-1 ${teleprompter ? 'text-nova-gold' : 'text-nova-muted hover:text-white'}`}>
                    <FileText size={11} /> {teleprompter ? 'Hide teleprompter' : 'Show teleprompter'}
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-2 block">Episode Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={selectedScript?.part_title || 'My Episode'}
                  className="nova-input text-sm w-full" />
              </div>
            </div>

            {!thumbnailMode && (cameras.length > 1 || mics.length > 1) && (
              <div className="nova-card space-y-3">
                <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">Devices</p>
                {cameras.length > 1 && (
                  <div>
                    <label className="text-[10px] font-mono text-nova-muted mb-1 block">Camera</label>
                    <select value={camId} onChange={e => { setCamId(e.target.value); startPreview() }} className="nova-input text-xs w-full">
                      {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}
                    </select>
                  </div>
                )}
                {mics.length > 1 && (
                  <div>
                    <label className="text-[10px] font-mono text-nova-muted mb-1 block">Microphone</label>
                    <select value={micId} onChange={e => { setMicId(e.target.value); startPreview() }} className="nova-input text-xs w-full">
                      {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <button onClick={startRecording}
              disabled={thumbnailMode && !thumbnailUrl && micOn === false}
              className="w-full py-4 rounded-2xl text-white font-display text-xl tracking-wide transition-all hover:scale-[1.02] flex items-center justify-center gap-3 disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${showColor}, ${showColor}88)` }}>
              <span className="w-4 h-4 rounded-full bg-white animate-pulse" />
              START RECORDING
            </button>
            <p className="text-xs font-mono text-nova-muted text-center">
              {thumbnailMode ? '🎙 Audio + thumbnail' : '📹 Camera + audio'} · 3-2-1 countdown
            </p>
          </div>
        </div>
      )}

      {/* ── RECORDING ── */}
      {stage === 'recording' && (
        <div className="flex flex-col items-center gap-6">
          <div className="relative rounded-2xl overflow-hidden bg-black w-full max-w-2xl aspect-video border-2"
            style={{ borderColor: countdown > 0 ? showColor : '#C1121F' }}>

            {thumbnailMode ? (
              <div className="w-full h-full flex items-center justify-center"
                style={{ background: thumbnailUrl ? `url(${thumbnailUrl}) center/cover` : '#0a0a1e' }}>
                {!thumbnailUrl && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-nova-gold/20 flex items-center justify-center">
                      <Mic size={28} className="text-nova-gold" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <video ref={previewRef} autoPlay muted playsInline
                className="w-full h-full object-cover"
                style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }} />
            )}

            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-white font-display text-8xl" style={{ textShadow: `0 0 30px ${showColor}` }}>
                  {countdown}
                </span>
              </div>
            )}

            {countdown === 0 && !paused && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-nova-crimson/90">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-white text-sm font-mono font-bold">REC</span>
              </div>
            )}
            {paused && (
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-yellow-600/90">
                <span className="text-white text-sm font-mono font-bold">PAUSED</span>
              </div>
            )}
            <div className="absolute top-4 right-4 text-white text-lg font-mono bg-black/40 px-2 py-1 rounded">
              {fmtTime(elapsed)}
            </div>

            {teleprompter && selectedScript && countdown === 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 max-h-36 overflow-y-auto">
                <p className="text-white leading-relaxed font-body text-center"
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}>
                  {selectedScript.script_text}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={pauseResume}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-yellow-500/40 text-yellow-400 font-body hover:bg-yellow-500/10 transition-all">
              {paused ? <><Play size={18} /> Resume</> : <><Pause size={18} /> Pause</>}
            </button>
            <button onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-nova-crimson/80 text-white font-body hover:bg-nova-crimson transition-all">
              <Square size={18} fill="currentColor" /> Stop
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW + TRIM ── */}
      {stage === 'review' && blobRef.current && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-nova-border/40">
              <video ref={reviewRef} playsInline controls
                className="w-full h-full object-contain" />
            </div>

            {/* Trim editor */}
            <div className="nova-card space-y-3">
              <div className="flex items-center gap-2">
                <Scissors size={14} className="text-nova-gold" />
                <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Trim</span>
                <span className="text-xs font-mono text-nova-muted ml-auto">
                  {fmtTime(trimStart)} → {fmtTime(trimEnd)}
                  <span className={`ml-2 ${isTrimmed ? 'text-nova-gold' : ''}`}>({fmtTime(trimEnd - trimStart)})</span>
                </span>
              </div>

              {duration > 0 && (
                <div ref={trimBarRef}
                  className="relative h-12 bg-nova-navydark/60 rounded-xl overflow-hidden border border-nova-border/40">
                  <div className="absolute inset-0 bg-nova-border/20" />
                  <div className="absolute inset-y-0 bg-nova-gold/20 border-y border-nova-gold/40"
                    style={{ left: `${(trimStart/duration)*100}%`, right: `${(1-trimEnd/duration)*100}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-black/50" style={{ width: `${(trimStart/duration)*100}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-black/50" style={{ width: `${(1-trimEnd/duration)*100}%` }} />
                  <div className="absolute inset-y-0 w-4 bg-nova-gold cursor-ew-resize flex items-center justify-center rounded-l-lg"
                    style={{ left: `${(trimStart/duration)*100}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={onTrimMouseDown('start')}>
                    <ChevronRight size={12} className="text-white" />
                  </div>
                  <div className="absolute inset-y-0 w-4 bg-nova-gold cursor-ew-resize flex items-center justify-center rounded-r-lg"
                    style={{ left: `${(trimEnd/duration)*100}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={onTrimMouseDown('end')}>
                    <ChevronLeft size={12} className="text-white" />
                  </div>
                  <div className="absolute inset-y-0 w-0.5 bg-white/60 pointer-events-none"
                    style={{ left: `${(previewTime/duration)*100}%` }} />
                  <div className="absolute inset-0 cursor-pointer"
                    onClick={e => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      seekTo((e.clientX - rect.left) / rect.width)
                    }} />
                </div>
              )}

              <div className="flex items-center gap-4 text-xs font-mono text-nova-muted">
                <button onClick={() => setTrimStart(0)} className="hover:text-white flex items-center gap-1">
                  <SkipBack size={11} /> Reset start
                </button>
                <button onClick={() => setTrimEnd(duration)} className="hover:text-white flex items-center gap-1">
                  Reset end <SkipForward size={11} />
                </button>
                {isTrimmed && (
                  <span className="ml-auto text-nova-gold">✂ Trim applied — saved on upload</span>
                )}
              </div>
              <p className="text-[10px] font-mono text-nova-muted">
                Drag the gold handles to trim. The full recording saves — trim points are stored as metadata.
              </p>
            </div>
          </div>

          {/* Upload panel */}
          <div className="space-y-4">
            <div className="nova-card space-y-4">
              <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">Episode Details</p>
              <div>
                <label className="text-[10px] font-mono text-nova-muted mb-1 block">Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={selectedScript?.part_title || 'Episode title...'}
                  className="nova-input text-sm w-full" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-nova-muted mb-1 block">Show</label>
                <select value={showId} onChange={e => setShowId(e.target.value)} className="nova-input text-sm w-full">
                  {shows.map(s => <option key={s.id} value={s.id}>{SHOW_LABELS[s.show_name] || s.show_name}</option>)}
                </select>
              </div>
              <div className="border-t border-nova-border pt-3 space-y-1 text-xs font-mono text-nova-muted">
                <div className="flex justify-between"><span>Duration</span><span>{fmtTime(duration)}</span></div>
                {isTrimmed && <div className="flex justify-between text-nova-gold"><span>After trim</span><span>{fmtTime(trimEnd - trimStart)}</span></div>}
                <div className="flex justify-between"><span>Source</span><span className="text-nova-teal">{thumbnailMode ? 'Audio + thumbnail' : 'Self-recorded'}</span></div>
              </div>
            </div>

            {blobRef.current && (
              <a href={URL.createObjectURL(blobRef.current)}
                download={`nova-recording-${Date.now()}.webm`}
                className="nova-btn-ghost w-full flex items-center justify-center gap-2 text-sm py-3">
                <Download size={14} /> Download Raw
              </a>
            )}

            <button onClick={upload}
              className="w-full py-4 rounded-2xl text-white font-display text-lg tracking-wide transition-all hover:scale-[1.01] flex items-center justify-center gap-3"
              style={{ background: `linear-gradient(135deg, ${showColor}, ${showColor}88)` }}>
              <Upload size={20} /> SAVE & PUBLISH
            </button>
            <button onClick={reset} className="nova-btn-ghost w-full text-sm py-2">Re-record</button>
          </div>
        </div>
      )}

      {/* ── UPLOADING ── */}
      {stage === 'uploading' && (
        <div className="flex flex-col items-center gap-6 py-16">
          <div className="relative w-24 h-24">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#1A1A2E" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                stroke={showColor}
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - uploadProgress / 100)}`}
                className="transition-all duration-300" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-display text-xl">{uploadProgress}%</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-white font-display text-xl">
              {uploadProgress < 50 ? 'Uploading recording...' : uploadProgress < 85 ? 'Saving to cloud...' : 'Creating episode...'}
            </p>
            <p className="text-nova-muted font-mono text-sm mt-1">Don't close this tab</p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {stage === 'done' && (
        <div className="flex flex-col items-center gap-6 py-16">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${showColor}20`, border: `2px solid ${showColor}` }}>
            <Check size={36} style={{ color: showColor }} />
          </div>
          <div className="text-center">
            <h2 className="text-white font-display text-2xl mb-2">Episode Saved!</h2>
            <p className="text-nova-muted font-mono text-sm">Live in Episodes. Go to Studio to generate social copy.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <a href="/episodes" className="nova-btn-primary flex items-center gap-2 px-6 py-3">
              <Video size={16} /> View Episodes
            </a>
            <a href="/studio" className="nova-btn-ghost flex items-center gap-2 px-6 py-3">
              <Radio size={16} /> Generate Content
            </a>
            <button onClick={reset} className="nova-btn-ghost flex items-center gap-2 px-6 py-3">
              <Camera size={16} /> Record Another
            </button>
          </div>
        </div>
      )}
    </div>
    </GuestGate>
  )
}