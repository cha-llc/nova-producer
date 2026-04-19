import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Video, VideoOff, Mic, MicOff, Play, Square, Pause, Upload,
  RefreshCw, ChevronLeft, ChevronRight, Check, Loader2, Camera,
  FileText, SkipBack, SkipForward, Scissors, Maximize2, Minimize2,
  AlertCircle, Download, Radio
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
  // devices
  const [cameras, setCameras]     = useState<MediaDeviceInfo[]>([])
  const [mics, setMics]           = useState<MediaDeviceInfo[]>([])
  const [camId, setCamId]         = useState('')
  const [micId, setMicId]         = useState('')
  const [camOn, setCamOn]         = useState(true)
  const [micOn, setMicOn]         = useState(true)
  const [mirrored, setMirrored]   = useState(true)

  // show + script
  const [shows, setShows]         = useState<ShowConfig[]>([])
  const [scripts, setScripts]     = useState<Script[]>([])
  const [showId, setShowId]       = useState('')
  const [scriptId, setScriptId]   = useState('')
  const [title, setTitle]         = useState('')
  const [teleprompter, setTeleprompter] = useState(false)
  const [fontSize, setFontSize]   = useState(24)

  // recording state
  const [stage, setStage]         = useState<Stage>('setup')
  const [countdown, setCountdown] = useState(0)
  const [elapsed, setElapsed]     = useState(0)
  const [paused, setPaused]       = useState(false)

  // trim state
  const [duration, setDuration]   = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd]     = useState(0)
  const [previewTime, setPreviewTime] = useState(0)

  // result
  const [uploadProgress, setUploadProgress] = useState(0)
  const [episodeId, setEpisodeId] = useState('')
  const [error, setError]         = useState('')

  // refs
  const previewRef  = useRef<HTMLVideoElement>(null)
  const reviewRef   = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const blobRef     = useRef<Blob | null>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const trimBarRef  = useRef<HTMLDivElement>(null)
  const dragging    = useRef<'start' | 'end' | null>(null)

  // Load devices
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then(devs => {
        const cams = devs.filter(d => d.kind === 'videoinput')
        const mics = devs.filter(d => d.kind === 'audioinput')
        setCameras(cams)
        setMics(mics)
        if (cams.length) setCamId(cams[0].deviceId)
        if (mics.length) setMicId(mics[0].deviceId)
      })
      .catch(() => setError('Camera/mic access denied. Please allow in browser settings.'))
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
      .select('id,part_title,script_text,show_id')
      .eq('show_id', showId)
      .in('status', ['draft', 'ready'])
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setScripts(data ?? [])
        setScriptId('')
      })
  }, [showId])

  // Start/restart camera preview
  const startPreview = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camOn ? { deviceId: camId ? { exact: camId } : undefined, width: 1080, height: 1920 } : false,
        audio: micOn ? { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } : false,
      })
      streamRef.current = stream
      if (previewRef.current) {
        previewRef.current.srcObject = stream
        previewRef.current.muted = true
        previewRef.current.play()
      }
    } catch (e) {
      setError(`Could not access camera/mic: ${String(e)}`)
    }
  }, [camOn, camId, micOn, micId])

  useEffect(() => {
    if (stage === 'setup') startPreview()
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [stage, startPreview])

  // Re-apply cam/mic mute without restarting stream
  useEffect(() => {
    if (!streamRef.current) return
    streamRef.current.getVideoTracks().forEach(t => { t.enabled = camOn })
    streamRef.current.getAudioTracks().forEach(t => { t.enabled = micOn })
  }, [camOn, micOn])

  // Countdown then record
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

    if (!streamRef.current) return

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    recorderRef.current = recorder
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      blobRef.current = blob
      const url = URL.createObjectURL(blob)
      if (reviewRef.current) {
        reviewRef.current.src = url
        reviewRef.current.onloadedmetadata = () => {
          const dur = reviewRef.current?.duration || 0
          setDuration(dur)
          setTrimStart(0)
          setTrimEnd(dur)
        }
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      setStage('review')
    }

    recorder.start(250)

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(e => e + 1)
    }, 1000)
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

  // Trim drag handlers
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

  // Seek preview
  const seekTo = (pct: number) => {
    if (!reviewRef.current) return
    const t = pct * duration
    reviewRef.current.currentTime = t
    setPreviewTime(t)
  }

  useEffect(() => {
    const v = reviewRef.current
    if (!v) return
    const onTime = () => setPreviewTime(v.currentTime)
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [stage])

  // Trim and export blob
  const trimVideo = async (): Promise<Blob> => {
    if (!blobRef.current || !reviewRef.current) return blobRef.current!
    if (trimStart === 0 && Math.abs(trimEnd - duration) < 0.1) return blobRef.current!

    // Re-record the trimmed segment using MediaRecorder + the video element
    const video = reviewRef.current
    video.currentTime = trimStart

    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 1080
    canvas.height = video.videoHeight || 1920
    const ctx = canvas.getContext('2d')!

    const canvasStream = canvas.captureStream(30)
    // Add audio from original blob (best we can do in browser without FFmpeg)
    const audioCtx = new AudioContext()
    const src = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    src.connect(dest)
    src.connect(audioCtx.destination)
    dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t))

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(canvasStream, { mimeType })
    const chunks: Blob[] = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

    return new Promise(resolve => {
      recorder.start(100)
      video.play()

      const drawFrame = () => {
        if (video.currentTime >= trimEnd || video.ended) {
          recorder.stop()
          canvasStream.getTracks().forEach(t => t.stop())
          audioCtx.close()
          video.pause()
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        requestAnimationFrame(drawFrame)
      }
      drawFrame()

      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }))
      }
    })
  }

  // Upload and create episode
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

      setUploadProgress(20)
      const trimmedBlob = await trimVideo()
      setUploadProgress(40)

      const ext = trimmedBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const filename = `self-recorded/${showName}/${Date.now()}.${ext}`

      // Convert blob to ArrayBuffer for upload
      const buffer = await trimmedBlob.arrayBuffer()
      const { error: uploadErr } = await supabase.storage
        .from('newsletter-assets')
        .upload(filename, buffer, { contentType: trimmedBlob.type, upsert: false })

      if (uploadErr) throw new Error(uploadErr.message)
      setUploadProgress(75)

      const { data: urlData } = supabase.storage
        .from('newsletter-assets')
        .getPublicUrl(filename)
      const storageUrl = urlData.publicUrl
      setUploadProgress(85)

      // Create ai_episode directly as complete
      const { data: ep, error: epErr } = await supabase.from('ai_episodes').insert({
        show_name:    showName,
        episode_title: episodeTitle,
        storage_url:  storageUrl,
        status:       'complete',
        source:       'self_recorded',
        script_id:    scriptId || null,
        heygen_video_id: '',
      }).select().single()

      if (epErr) throw new Error(epErr.message)
      setUploadProgress(95)

      // Mark script as done if one was selected
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
            <Camera size={28} className="text-nova-gold" /> RECORD
          </h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            Record yourself — no avatar, no voice clone. Your real camera and mic.
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
          {/* Camera preview */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-nova-border/40">
              <video ref={previewRef} autoPlay muted playsInline
                className="w-full h-full object-cover"
                style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }} />
              {!camOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-nova-navydark/80">
                  <VideoOff size={40} className="text-nova-muted" />
                </div>
              )}
              {/* Overlay controls */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <button onClick={() => setCamOn(v => !v)}
                  className={`p-2 rounded-full transition-all ${camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-nova-crimson/80 hover:bg-nova-crimson'}`}>
                  {camOn ? <Video size={16} className="text-white" /> : <VideoOff size={16} className="text-white" />}
                </button>
                <button onClick={() => setMicOn(v => !v)}
                  className={`p-2 rounded-full transition-all ${micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-nova-crimson/80 hover:bg-nova-crimson'}`}>
                  {micOn ? <Mic size={16} className="text-white" /> : <MicOff size={16} className="text-white" />}
                </button>
                <button onClick={() => setMirrored(v => !v)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                  title="Mirror camera">
                  <Maximize2 size={16} className="text-white" />
                </button>
              </div>
            </div>

            {/* Teleprompter */}
            {teleprompter && selectedScript && (
              <div className="nova-card relative overflow-hidden max-h-48 overflow-y-auto"
                style={{ borderColor: `${showColor}40` }}>
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
              {/* Show selector */}
              <div>
                <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-2 block">Show</label>
                <select value={showId} onChange={e => setShowId(e.target.value)}
                  className="nova-input text-sm w-full">
                  {shows.map(s => (
                    <option key={s.id} value={s.id}>{SHOW_LABELS[s.show_name] || s.show_name}</option>
                  ))}
                </select>
              </div>

              {/* Script selector */}
              <div>
                <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-2 block">
                  Script <span className="text-nova-muted/50">(optional teleprompter)</span>
                </label>
                <select value={scriptId} onChange={e => setScriptId(e.target.value)}
                  className="nova-input text-sm w-full">
                  <option value="">— No script —</option>
                  {scripts.map(s => (
                    <option key={s.id} value={s.id}>{s.part_title}</option>
                  ))}
                </select>
                {scriptId && (
                  <button onClick={() => setTeleprompter(v => !v)}
                    className={`mt-2 text-xs font-mono flex items-center gap-1 transition-all ${teleprompter ? 'text-nova-gold' : 'text-nova-muted hover:text-white'}`}>
                    <FileText size={11} /> {teleprompter ? 'Hide teleprompter' : 'Show teleprompter'}
                  </button>
                )}
              </div>

              {/* Episode title */}
              <div>
                <label className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-2 block">Episode Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={selectedScript?.part_title || 'My Episode'}
                  className="nova-input text-sm w-full" />
              </div>
            </div>

            {/* Device selectors */}
            <div className="nova-card space-y-3">
              <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">Devices</p>
              {cameras.length > 1 && (
                <div>
                  <label className="text-[10px] font-mono text-nova-muted mb-1 block">Camera</label>
                  <select value={camId} onChange={e => { setCamId(e.target.value); startPreview() }}
                    className="nova-input text-xs w-full">
                    {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}
                  </select>
                </div>
              )}
              {mics.length > 1 && (
                <div>
                  <label className="text-[10px] font-mono text-nova-muted mb-1 block">Microphone</label>
                  <select value={micId} onChange={e => { setMicId(e.target.value); startPreview() }}
                    className="nova-input text-xs w-full">
                    {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)}
                  </select>
                </div>
              )}
            </div>

            <button onClick={startRecording}
              className="w-full py-4 rounded-2xl text-white font-display text-xl tracking-wide transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
              style={{ background: `linear-gradient(135deg, ${showColor}, ${showColor}88)` }}>
              <div className="w-4 h-4 rounded-full bg-white animate-pulse" />
              START RECORDING
            </button>
          </div>
        </div>
      )}

      {/* ── RECORDING ── */}
      {stage === 'recording' && (
        <div className="flex flex-col items-center gap-6">
          <div className="relative rounded-2xl overflow-hidden bg-black w-full max-w-2xl aspect-video border border-nova-crimson/40">
            <video ref={previewRef} autoPlay muted playsInline
              className="w-full h-full object-cover"
              style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }} />

            {/* Countdown overlay */}
            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-white font-display text-8xl" style={{ textShadow: '0 0 30px rgba(201,168,76,0.8)' }}>
                  {countdown}
                </span>
              </div>
            )}

            {/* REC indicator */}
            {countdown === 0 && !paused && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-nova-crimson/90">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-white text-sm font-mono font-bold">REC</span>
              </div>
            )}

            {paused && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-600/90">
                <span className="text-white text-sm font-mono font-bold">PAUSED</span>
              </div>
            )}

            <div className="absolute top-4 right-4 text-white text-lg font-mono">{fmtTime(elapsed)}</div>

            {/* Teleprompter overlay */}
            {teleprompter && selectedScript && countdown === 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 max-h-40 overflow-y-auto">
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
              <Square size={18} fill="currentColor" /> Stop Recording
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW + TRIM ── */}
      {stage === 'review' && blobRef.current && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Video preview */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-nova-border/40">
              <video ref={reviewRef} playsInline
                className="w-full h-full object-contain"
                style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }} />
            </div>

            {/* Playback controls */}
            <div className="nova-card space-y-3">
              <div className="flex items-center gap-3">
                <button onClick={() => { if (reviewRef.current) { reviewRef.current.currentTime = trimStart; reviewRef.current.play() }}}
                  className="nova-btn-ghost p-2"><Play size={16} /></button>
                <button onClick={() => reviewRef.current?.pause()}
                  className="nova-btn-ghost p-2"><Pause size={16} /></button>
                <span className="text-xs font-mono text-nova-muted ml-auto">{fmtTime(previewTime)} / {fmtTime(duration)}</span>
              </div>

              {/* Scrubber */}
              <div className="relative h-2 bg-nova-border/40 rounded-full cursor-pointer"
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  seekTo((e.clientX - rect.left) / rect.width)
                }}>
                <div className="absolute inset-y-0 bg-nova-gold/20 rounded-full"
                  style={{ left: `${(trimStart / duration) * 100}%`, right: `${(1 - trimEnd / duration) * 100}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-nova-gold border-2 border-white"
                  style={{ left: `${(previewTime / duration) * 100}%`, transform: 'translate(-50%, -50%)' }} />
              </div>
            </div>

            {/* Trim editor */}
            <div className="nova-card space-y-3">
              <div className="flex items-center gap-2">
                <Scissors size={14} className="text-nova-gold" />
                <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Trim</span>
                <span className="text-xs font-mono text-nova-muted ml-auto">
                  {fmtTime(trimStart)} → {fmtTime(trimEnd)} ({fmtTime(trimEnd - trimStart)})
                </span>
              </div>

              {/* Trim bar */}
              <div ref={trimBarRef} className="relative h-12 bg-nova-navydark/60 rounded-xl overflow-hidden border border-nova-border/40"
                style={{ cursor: 'default' }}>
                {/* Full duration bar */}
                <div className="absolute inset-0 bg-nova-border/20" />

                {/* Selected region */}
                <div className="absolute inset-y-0 bg-nova-gold/20 border-y border-nova-gold/40"
                  style={{
                    left:  `${(trimStart / duration) * 100}%`,
                    right: `${(1 - trimEnd / duration) * 100}%`,
                  }} />

                {/* Left excluded region */}
                <div className="absolute inset-y-0 left-0 bg-black/40"
                  style={{ width: `${(trimStart / duration) * 100}%` }} />

                {/* Right excluded region */}
                <div className="absolute inset-y-0 right-0 bg-black/40"
                  style={{ width: `${(1 - trimEnd / duration) * 100}%` }} />

                {/* Start handle */}
                <div
                  className="absolute inset-y-0 w-3 bg-nova-gold cursor-ew-resize flex items-center justify-center rounded-l-xl"
                  style={{ left: `${(trimStart / duration) * 100}%`, transform: 'translateX(-50%)' }}
                  onMouseDown={onTrimMouseDown('start')}>
                  <ChevronRight size={12} className="text-white" />
                </div>

                {/* End handle */}
                <div
                  className="absolute inset-y-0 w-3 bg-nova-gold cursor-ew-resize flex items-center justify-center rounded-r-xl"
                  style={{ left: `${(trimEnd / duration) * 100}%`, transform: 'translateX(-50%)' }}
                  onMouseDown={onTrimMouseDown('end')}>
                  <ChevronLeft size={12} className="text-white" />
                </div>

                {/* Playhead */}
                <div className="absolute inset-y-0 w-0.5 bg-white/70 pointer-events-none"
                  style={{ left: `${(previewTime / duration) * 100}%` }} />
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-nova-muted">
                <button onClick={() => setTrimStart(0)} className="hover:text-white transition-all flex items-center gap-1">
                  <SkipBack size={11} /> Reset start
                </button>
                <button onClick={() => setTrimEnd(duration)} className="hover:text-white transition-all flex items-center gap-1">
                  Reset end <SkipForward size={11} />
                </button>
                <button onClick={() => { setTrimStart(0); setTrimEnd(duration) }} className="hover:text-white ml-auto">
                  Reset all
                </button>
              </div>
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
                <select value={showId} onChange={e => setShowId(e.target.value)}
                  className="nova-input text-sm w-full">
                  {shows.map(s => <option key={s.id} value={s.id}>{SHOW_LABELS[s.show_name] || s.show_name}</option>)}
                </select>
              </div>

              <div className="border-t border-nova-border pt-3 space-y-1 text-xs font-mono text-nova-muted">
                <div className="flex justify-between"><span>Full duration</span><span>{fmtTime(duration)}</span></div>
                <div className="flex justify-between"><span>After trim</span><span className="text-nova-gold">{fmtTime(trimEnd - trimStart)}</span></div>
                <div className="flex justify-between"><span>Source</span><span className="text-nova-teal">Self-recorded</span></div>
              </div>
            </div>

            {/* Download raw option */}
            {blobRef.current && (
              <a href={URL.createObjectURL(blobRef.current)}
                download={`nova-recording-${Date.now()}.webm`}
                className="nova-btn-ghost w-full flex items-center justify-center gap-2 text-sm py-3">
                <Download size={14} /> Download Raw Recording
              </a>
            )}

            <button onClick={upload}
              className="w-full py-4 rounded-2xl text-white font-display text-lg tracking-wide transition-all hover:scale-[1.01] flex items-center justify-center gap-3"
              style={{ background: `linear-gradient(135deg, ${showColor}, ${showColor}88)` }}>
              <Upload size={20} /> SAVE & PUBLISH
            </button>

            <button onClick={reset} className="nova-btn-ghost w-full text-sm py-2">
              Re-record
            </button>
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
              {uploadProgress < 40 ? 'Processing trim...' : uploadProgress < 75 ? 'Uploading...' : 'Creating episode...'}
            </p>
            <p className="text-nova-muted font-mono text-sm mt-1">Don't close this tab</p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {stage === 'done' && (
        <div className="flex flex-col items-center gap-6 py-16">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${showColor}20`, border: `2px solid ${showColor}` }}>
            <Check size={36} style={{ color: showColor }} />
          </div>
          <div className="text-center">
            <h2 className="text-white font-display text-2xl mb-2">Episode Saved!</h2>
            <p className="text-nova-muted font-mono text-sm">Your recording is live in the Episodes page.</p>
          </div>
          <div className="flex items-center gap-4">
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
  )
}
