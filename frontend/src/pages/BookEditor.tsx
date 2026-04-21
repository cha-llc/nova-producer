import { useState, useRef, useCallback, useEffect } from 'react'
import {
  BookOpen, Upload, Wand2, FileText, Image, Loader2,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Download, Star, RefreshCw, Sparkles, BookMarked,
  PenTool, LayoutTemplate, Tag, ArrowRight, X, Plus,
  Cloud, BookCopy, Library, Mic2, BarChart2,
  RotateCcw, Lock, Unlock, Trophy, Lock as LockIcon
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Genre =
  | 'thriller' | 'mystery' | 'literary_fiction'
  | 'romance' | 'sci_fi' | 'historical_fiction'
  | 'memoir' | 'self_help' | 'crime'

type ProcessingStage =
  | 'idle' | 'parsing' | 'rewriting' | 'scoring'
  | 'cover_gen' | 'formatting' | 'done' | 'error'

type ActiveTab = 'rewrite' | 'cover' | 'metadata' | 'tools' | 'export'

type ChapterResult = {
  number: number
  title: string
  original_words: number
  rewritten_words: number
  oprah_score: number
  reading_level: number
  feedback: string
  rewritten_text: string
  title_suggestions: string[]
  expanded: boolean
  regenerating: boolean
}

type CoverResult = {
  front_url: string
  back_blurb: string
  tagline: string
}

type KDPMetadata = {
  title: string
  subtitle: string
  author: string
  genre: string
  categories: string[]
  keywords: string[]
  description: string
  bisac: string
}

type SeriesBook = {
  id: string
  title: string
  bookNumber: number
  status: 'complete' | 'in_progress' | 'planned'
  wordCount: number
  oprahScore: number
  driveUrl: string
  savedAt: string
}

type VoiceProfile = {
  id: string
  name: string
  genre: Genre
  tone: string
  pov: string
  sentences: string
  vocabulary: string
  fingerprint: string
  createdAt: string
}

type CompTitle = {
  title: string
  author: string
  category: string
  why: string
  rank: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const GENRE_OPTIONS: { value: Genre; label: string; description: string }[] = [
  { value: 'thriller',           label: 'Thriller',           description: 'Tense, fast-paced, high-stakes'    },
  { value: 'mystery',            label: 'Mystery',            description: 'Puzzle-driven, investigative'      },
  { value: 'literary_fiction',   label: 'Literary Fiction',   description: 'Character-driven, prose-forward'   },
  { value: 'crime',              label: 'Crime',              description: 'Procedural, gritty, investigative' },
  { value: 'romance',            label: 'Romance',            description: 'Emotional, relationship-centred'   },
  { value: 'sci_fi',             label: 'Science Fiction',    description: 'Speculative, world-building'       },
  { value: 'historical_fiction', label: 'Historical Fiction', description: 'Period-accurate, character-rich'   },
  { value: 'memoir',             label: 'Memoir / Narrative', description: 'First-person, truth-driven voice'  },
  { value: 'self_help',          label: 'Self-Help',          description: 'Actionable, transformational'      },
]

const SCORE_COLOR = (s: number) =>
  s >= 9 ? 'text-green-400' : s >= 7 ? 'text-nova-gold' :
  s >= 5 ? 'text-yellow-500' : 'text-nova-crimson'

const SCORE_LABEL = (s: number) =>
  s >= 9 ? 'Oprah-Worthy' : s >= 7 ? 'Highly Marketable' :
  s >= 5 ? 'Solid — Polish Needed' : 'Needs Major Work'

const RL_LABEL = (g: number) =>
  g <= 6 ? 'Middle Grade' : g <= 8 ? 'Young Adult' :
  g <= 10 ? 'General Adult' : g <= 12 ? 'Literary Adult' : 'Academic'

const DRIVE_FOLDER_ID = '1P-UETwfy0b4hZMvsALOsdasPIBQFECxV'
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string
const LS_KEY          = 'nova_book_editor_v2'

// ─────────────────────────────────────────────────────────────────────────────
// Flesch-Kincaid grade level (client-side)
// ─────────────────────────────────────────────────────────────────────────────
function fleschKincaid(text: string): number {
  const sentences = (text.match(/[.!?]+/g) || []).length || 1
  const words     = text.split(/\s+/).filter(Boolean).length || 1
  const syllables = text.toLowerCase().replace(/[^a-z]/g, ' ').split(/\s+/)
    .reduce((acc, w) => {
      const n = Math.max(1, w.replace(/e$/, '').replace(/[aeiou]{2,}/g, 'a')
        .split('').filter(c => 'aeiou'.includes(c)).length)
      return acc + n
    }, 0)
  return Math.max(1, Math.min(16, Math.round(
    0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
  )))
}

function uid() { return Math.random().toString(36).slice(2, 9) }

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function BookEditor() {

  /* upload */
  const [rawText,    setRawText]    = useState('')
  const [fileName,   setFileName]   = useState('')
  const [genre,      setGenre]      = useState<Genre>('thriller')
  const [authorName, setAuthorName] = useState('C.J.H. Adisa')
  const fileRef = useRef<HTMLInputElement>(null)

  /* processing */
  const [stage,     setStage]     = useState<ProcessingStage>('idle')
  const [progress,  setProgress]  = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [error,     setError]     = useState('')

  /* results */
  const [chapters,     setChapters]     = useState<ChapterResult[]>([])
  const [cover,        setCover]        = useState<CoverResult | null>(null)
  const [metadata,     setMetadata]     = useState<KDPMetadata | null>(null)
  const [overallScore, setOverallScore] = useState(0)
  const [avgRL,        setAvgRL]        = useState(0)
  const [compTitles,   setCompTitles]   = useState<CompTitle[]>([])
  const [compLoading,  setCompLoading]  = useState(false)

  /* export */
  const [driveStatus,  setDriveStatus]  = useState<'idle'|'uploading'|'done'|'error'>('idle')
  const [driveFileUrl, setDriveFileUrl] = useState('')
  const [epubStatus,   setEpubStatus]   = useState<'idle'|'building'|'done'|'error'>('idle')

  /* ui */
  const [activeTab, setActiveTab] = useState<ActiveTab>('rewrite')

  /* Tier 1: Series */
  const [seriesName,  setSeriesName]  = useState('C.H.A. LLC Series')
  const [seriesBooks, setSeriesBooks] = useState<SeriesBook[]>([])
  const [showSeries,  setShowSeries]  = useState(false)

  /* Tier 1: Voice lock */
  const [voiceProfiles,  setVoiceProfiles]  = useState<VoiceProfile[]>([])
  const [activeVoice,    setActiveVoice]    = useState<VoiceProfile | null>(null)
  const [voiceLocked,    setVoiceLocked]    = useState(false)
  const [capturingVoice, setCapturingVoice] = useState(false)
  const [newVoiceName,   setNewVoiceName]   = useState('')

  /* persist helpers */
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      if (d.seriesBooks)   setSeriesBooks(d.seriesBooks)
      if (d.voiceProfiles) setVoiceProfiles(d.voiceProfiles)
      if (d.seriesName)    setSeriesName(d.seriesName)
    } catch { /* ignore */ }
  }, [])

  const persist = (u: Record<string, unknown>) => {
    try {
      const e = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      localStorage.setItem(LS_KEY, JSON.stringify({ ...e, ...u }))
    } catch { /* ignore */ }
  }

  /* file handling */
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name); setError('')
    const text  = await file.text()
    const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, '\n').trim()
    setRawText(clean)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  /* Claude helper */
  const claude = async (prompt: string, maxTokens = 4000): Promise<string> => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    if (!r.ok) throw new Error(`Claude ${r.status}`)
    const d   = await r.json()
    const raw = (d.content?.find((b: { type: string }) => b.type === 'text')?.text || '').trim()
    return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }

  /* ── Tier 1: Voice capture ── */
  const captureVoice = async () => {
    if (!chapters.length || !newVoiceName.trim()) return
    setCapturingVoice(true)
    try {
      const sample = chapters.slice(0, 3).map(c => c.rewritten_text.slice(0, 1500)).join('\n\n')
      const res    = await claude(`
Analyse this writing sample and extract a voice profile. Return ONLY valid JSON:
{"tone":"one phrase","pov":"first/third person limited/omniscient","sentences":"short and punchy/long and lyrical/varied","vocabulary":"plain/literary/conversational","fingerprint":"2-3 sentence description of most distinctive stylistic traits"}
SAMPLE:\n${sample}`, 1000)
      const p = JSON.parse(res)
      const profile: VoiceProfile = {
        id: uid(), name: newVoiceName.trim(), genre,
        tone: p.tone||'', pov: p.pov||'', sentences: p.sentences||'',
        vocabulary: p.vocabulary||'', fingerprint: p.fingerprint||'',
        createdAt: new Date().toISOString()
      }
      const updated = [...voiceProfiles, profile]
      setVoiceProfiles(updated); setActiveVoice(profile); setVoiceLocked(true)
      setNewVoiceName(''); persist({ voiceProfiles: updated })
    } catch { setError('Voice capture failed.') }
    setCapturingVoice(false)
  }

  /* ── Tier 1: Single chapter regen ── */
  const regenChapter = async (idx: number) => {
    const ch = chapters[idx]; if (!ch) return
    const u  = [...chapters]; u[idx] = { ...ch, regenerating: true }; setChapters(u)
    try {
      const gl = GENRE_OPTIONS.find(g => g.value === genre)?.label || 'Fiction'
      const vc = activeVoice && voiceLocked
        ? `\nVOICE (preserve): Tone=${activeVoice.tone} POV=${activeVoice.pov} Sentences=${activeVoice.sentences} Vocabulary=${activeVoice.vocabulary}\n${activeVoice.fingerprint}` : ''
      const res = await claude(`
World-class ${gl} editor. Oprah Book Club standard.${vc}
Return ONLY valid JSON:
{"title":"","rewritten_text":"","oprah_score":8,"feedback":"2 sentences","title_suggestions":["","",""]}
CHAPTER ${ch.number}: ${ch.title}\n${ch.rewritten_text}`, 5000)
      const obj = JSON.parse(res)
      const rl  = fleschKincaid(obj.rewritten_text || ch.rewritten_text)
      u[idx] = {
        ...ch,
        title:             obj.title            || ch.title,
        rewritten_text:    obj.rewritten_text   || ch.rewritten_text,
        rewritten_words:   (obj.rewritten_text  || ch.rewritten_text).split(/\s+/).length,
        oprah_score:       Math.min(10, Math.max(1, obj.oprah_score || ch.oprah_score)),
        feedback:          obj.feedback         || ch.feedback,
        title_suggestions: obj.title_suggestions || [],
        reading_level:     rl,
        regenerating:      false,
      }
      setChapters([...u])
    } catch {
      u[idx] = { ...ch, regenerating: false }; setChapters([...u])
    }
  }

  /* ── Tier 1: Comp titles ── */
  const fetchComps = async () => {
    if (!metadata) return
    setCompLoading(true); setCompTitles([])
    try {
      const res = await claude(`
Amazon KDP strategist. Find 3 comp titles for: "${metadata.title}" (${metadata.genre}).
Return ONLY valid JSON array:
[{"title":"","author":"","category":"","why":"1 sentence","rank":"e.g. #1 in Historical Mystery"}]
`, 1000)
      const arr = JSON.parse(res)
      setCompTitles(Array.isArray(arr) ? arr : [])
    } catch { setCompTitles([]) }
    setCompLoading(false)
  }

  /* ── Main pipeline ── */
  const runPipeline = async () => {
    if (!rawText.trim()) { setError('Please upload or paste a manuscript.'); return }
    setError(''); setChapters([]); setCover(null); setMetadata(null)
    setOverallScore(0); setAvgRL(0); setCompTitles([])
    setActiveTab('rewrite')

    try {
      setStage('parsing'); setProgress(5); setStatusMsg('Parsing manuscript structure…')
      const parseRes = await claude(`
Parse this manuscript into chapters. Return ONLY valid JSON.
{"title":"","chapters":[{"number":1,"title":"","text":""}]}
Max 20 chapters. MANUSCRIPT:\n${rawText.slice(0, 40000)}`)
      const parsed = JSON.parse(parseRes)
      const raw    = parsed.chapters || []
      if (!raw.length) throw new Error('No chapters found.')

      const gl = GENRE_OPTIONS.find(g => g.value === genre)?.label || 'Fiction'
      const vc = activeVoice && voiceLocked
        ? `\nVOICE PROFILE:\nTone: ${activeVoice.tone}\nPOV: ${activeVoice.pov}\nSentences: ${activeVoice.sentences}\nVocabulary: ${activeVoice.vocabulary}\n${activeVoice.fingerprint}` : ''

      setStage('rewriting')
      const rewritten: ChapterResult[] = []

      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i]
        setProgress(10 + Math.round((i / raw.length) * 55))
        setStatusMsg(`Rewriting Chapter ${ch.number}: ${ch.title}…`)
        const res = await claude(`
World-class ${gl} editor. Oprah Book Club standard. Expand, dramatise, add dialogue. Min 3x word count if under 1000w.${vc}
Return ONLY valid JSON:
{"title":"","rewritten_text":"","oprah_score":8,"feedback":"2 sentences","title_suggestions":["","",""]}
CHAPTER ${ch.number}: ${ch.title}\n${ch.text}`, 5000)
        let obj: { title: string; rewritten_text: string; oprah_score: number; feedback: string; title_suggestions: string[] }
        try { obj = JSON.parse(res) }
        catch { obj = { title: ch.title, rewritten_text: ch.text, oprah_score: 5, feedback: '', title_suggestions: [] } }
        const rl = fleschKincaid(obj.rewritten_text || ch.text)
        rewritten.push({
          number: ch.number, title: obj.title || ch.title,
          original_words: ch.text.split(/\s+/).length,
          rewritten_words: (obj.rewritten_text || ch.text).split(/\s+/).length,
          oprah_score: Math.min(10, Math.max(1, obj.oprah_score || 5)),
          reading_level: rl, feedback: obj.feedback || '',
          rewritten_text: obj.rewritten_text || ch.text,
          title_suggestions: obj.title_suggestions || [],
          expanded: false, regenerating: false,
        })
        setChapters([...rewritten])
      }

      setStage('scoring'); setProgress(68); setStatusMsg('Quality assessment…')
      const avgScore = Math.round(rewritten.reduce((s, c) => s + c.oprah_score, 0) / rewritten.length)
      const avgGrade = Math.round(rewritten.reduce((s, c) => s + c.reading_level, 0) / rewritten.length)
      setOverallScore(avgScore); setAvgRL(avgGrade)

      setProgress(72); setStatusMsg('Generating KDP metadata…')
      const metaRes = await claude(`
KDP publishing metadata. Return ONLY valid JSON.
{"title":"","subtitle":"","author":"${authorName}","genre":"${gl}","categories":["",""],"keywords":["","","","","","",""],"description":"150-200w Amazon description ending in a question","bisac":""}
Book: ${parsed.title}, Genre: ${gl}, Excerpt: ${rewritten[0]?.rewritten_text?.slice(0,1000)||''}`, 2000)
      let meta: KDPMetadata
      try { meta = JSON.parse(metaRes) }
      catch { meta = { title: parsed.title, subtitle: '', author: authorName, genre: gl, categories: [`Fiction > ${gl}`,'Literature & Fiction'], keywords: [gl,'novel',authorName,'fiction','CHA LLC'], description: '', bisac: 'FIC000000' } }
      setMetadata(meta)

      setStage('cover_gen'); setProgress(78); setStatusMsg('Generating cover art…')
      let coverResult: CoverResult = { front_url: '', back_blurb: '', tagline: '' }
      try {
        const cp = await claude(`
fal.ai prompt + back cover for "${meta.title}" (${gl}). Return ONLY valid JSON:
{"image_prompt":"cinematic book cover, dramatic lighting, no text, professional","tagline":"under 12 words","back_blurb":"80-100 words, present tense, ends with a question"}`, 600)
        const cm   = JSON.parse(cp)
        const sess = await supabase.auth.getSession()
        const ir   = await fetch(`${SUPABASE_URL}/functions/v1/nova-image`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${sess.data.session?.access_token}` },
          body: JSON.stringify({ prompt: cm.image_prompt, aspect_ratio:'2:3', source:'book-editor' })
        })
        const id = ir.ok ? await ir.json() : {}
        coverResult = { front_url: id.url||id.image_url||'', back_blurb: cm.back_blurb||'', tagline: cm.tagline||'' }
      } catch { /* non-fatal */ }
      setCover(coverResult)

      setStage('done'); setProgress(100); setStatusMsg('Complete.')
    } catch (err: unknown) {
      setStage('error'); setError(err instanceof Error ? err.message : 'Unexpected error.')
    }
  }

  /* ── EPUB download ── */
  const downloadEpub = () => {
    if (!chapters.length || !metadata) return
    setEpubStatus('building')
    try {
      const title  = metadata.title  || 'Untitled'
      const author = metadata.author || 'C.J.H. Adisa'
      const toc    = chapters.map(c => `<li><a href="#ch${c.number}">Chapter ${c.number}: ${c.title}</a></li>`).join('\n')
      const body   = chapters.map(c =>
        `<section id="ch${c.number}" epub:type="chapter"><h2>Chapter ${c.number}: ${c.title}</h2>\n${
          c.rewritten_text.split('\n').filter(Boolean).map(p => `<p>${p}</p>`).join('\n')
        }\n</section>`
      ).join('\n\n')
      const html = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:Georgia,serif;line-height:1.7;max-width:680px;margin:3em auto;padding:0 1.5em;color:#1a1a1a}h1{font-size:2em;text-align:center;margin:2em 0 .5em}h2{font-size:1.3em;text-align:center;margin:3em 0 1.5em;page-break-before:always}p{text-indent:1.5em;margin:0 0 .4em}.byline{text-align:center;color:#555;margin-bottom:3em}nav{margin:2em 0;padding:1em;background:#f9f9f9;border-radius:4px}nav h2{page-break-before:auto;margin:0 0 1em}nav ol{margin:0;padding-left:1.5em}nav li{margin:.3em 0}nav a{color:#333;text-decoration:none}</style>
</head><body>
<section epub:type="frontmatter">
<h1>${title}</h1>${metadata.subtitle?`<p class="byline"><em>${metadata.subtitle}</em></p>`:''}
<p class="byline">by ${author}</p><p class="byline">&#169; ${new Date().getFullYear()} ${author} &#183; C.H.A. LLC</p>
</section>
<nav epub:type="toc"><h2>Table of Contents</h2><ol>${toc}</ol></nav>
${body}
</body></html>`
      const blob = new Blob([html], { type: 'application/xhtml+xml' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_KDP.epub.html`
      a.click()
      setEpubStatus('done')
    } catch { setEpubStatus('error') }
  }

  /* ── Google Drive save ── */
  const saveToDrive = async () => {
    if (!chapters.length || !metadata) return
    setDriveStatus('uploading'); setDriveFileUrl('')
    try {
      const title  = metadata.title  || 'Untitled'
      const author = metadata.author || 'C.J.H. Adisa'
      const toc    = chapters.map(c => `<li><a href="#ch${c.number}">Ch ${c.number}: ${c.title}</a></li>`).join('\n')
      const body   = chapters.map(c =>
        `<section id="ch${c.number}"><h2>Chapter ${c.number}: ${c.title}</h2>${
          c.rewritten_text.split('\n').filter(Boolean).map(p => `<p>${p}</p>`).join('')
        }</section>`
      ).join('\n')
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:Georgia,serif;line-height:1.7;max-width:680px;margin:3em auto;padding:0 1.5em}h1{font-size:2em;text-align:center}h2{font-size:1.3em;text-align:center;margin-top:3em}p{text-indent:1.5em;margin:.3em 0}.byline{text-align:center;color:#555}</style></head>
<body><h1>${title}</h1>${metadata.subtitle?`<p class="byline"><em>${metadata.subtitle}</em></p>`:''}<p class="byline">by ${author}</p><p class="byline">&#169; ${new Date().getFullYear()} ${author} &#183; C.H.A. LLC</p><hr/><h2>Contents</h2><ol>${toc}</ol><hr/>${body}</body></html>`
      const b64  = btoa(unescape(encodeURIComponent(html)))
      const sess = await supabase.auth.getSession()
      const dr   = await fetch(`${SUPABASE_URL}/functions/v1/nova-drive-upload`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${sess.data.session?.access_token}` },
        body: JSON.stringify({ title:`${title} — ${author} (KDP EPUB).html`, content:b64, mimeType:'text/html', parentId:DRIVE_FOLDER_ID })
      })
      if (dr.ok) {
        const dd = await dr.json()
        setDriveFileUrl(dd.id ? `https://drive.google.com/file/d/${dd.id}/view` : `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`)
      } else {
        setDriveFileUrl(`https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`)
        downloadEpub()
      }
      setDriveStatus('done')
      // Tier 1: add to series tracker
      if (metadata.title) {
        const book: SeriesBook = {
          id: uid(), title: metadata.title,
          bookNumber: seriesBooks.length + 1, status: 'complete',
          wordCount: chapters.reduce((s,c)=>s+c.rewritten_words,0),
          oprahScore: overallScore,
          driveUrl: `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`,
          savedAt: new Date().toISOString(),
        }
        const updated = [...seriesBooks, book]
        setSeriesBooks(updated); persist({ seriesBooks: updated })
      }
    } catch {
      setDriveFileUrl(`https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`)
      setDriveStatus('done'); downloadEpub()
    }
  }

  const exportTxt = () => {
    if (!chapters.length) return
    const full = chapters.map(c => `# Chapter ${c.number}: ${c.title}\n\n${c.rewritten_text}`).join('\n\n---\n\n')
    const blob = new Blob([full], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `${fileName.replace(/\.[^.]+$/,'')}_KDP.txt`; a.click()
  }

  const isRunning = ['parsing','rewriting','scoring','cover_gen','formatting'].includes(stage)

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-nova-violet/20 flex items-center justify-center">
            <BookOpen size={18} className="text-nova-violet" />
          </div>
          <div>
            <h1 className="font-display text-white text-xl tracking-wide">BOOK EDITOR</h1>
            <p className="text-[11px] font-mono text-nova-muted">KDP REWRITER · OPRAH STANDARD · EPUB · DRIVE · SERIES · VOICE LOCK · COMP TITLES</p>
          </div>
        </div>
        {stage === 'done' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={downloadEpub} disabled={epubStatus==='building'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-nova-violet/10 border border-nova-violet/30 text-nova-violet text-xs hover:bg-nova-violet/20 disabled:opacity-50 transition-all">
              {epubStatus==='building'?<Loader2 size={12} className="animate-spin"/>:<BookCopy size={12}/>}EPUB
            </button>
            <button onClick={saveToDrive} disabled={driveStatus==='uploading'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-nova-teal/10 border border-nova-teal/30 text-nova-teal text-xs hover:bg-nova-teal/20 disabled:opacity-50 transition-all">
              {driveStatus==='uploading'?<Loader2 size={12} className="animate-spin"/>:driveStatus==='done'?<CheckCircle size={12}/>:<Cloud size={12}/>}
              {driveStatus==='done'?'Saved ✓':'Save to Drive'}
            </button>
            <button onClick={exportTxt}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-nova-gold/10 border border-nova-gold/30 text-nova-gold text-xs hover:bg-nova-gold/20 transition-all">
              <Download size={12}/>.txt
            </button>
          </div>
        )}
      </div>

      {/* Setup */}
      {(stage === 'idle' || stage === 'error') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {activeVoice && voiceLocked && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-nova-gold/5 border border-nova-gold/30">
                <div className="flex items-center gap-2">
                  <LockIcon size={12} className="text-nova-gold"/>
                  <span className="text-xs text-nova-gold">Voice locked: <strong>{activeVoice.name}</strong></span>
                  <span className="text-[10px] font-mono text-nova-muted">— {activeVoice.tone}</span>
                </div>
                <button onClick={() => setVoiceLocked(false)}>
                  <Unlock size={11} className="text-nova-muted hover:text-white"/>
                </button>
              </div>
            )}
            <div onDrop={onDrop} onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
              className="border-2 border-dashed border-nova-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-nova-violet/50 hover:bg-nova-violet/5 transition-all">
              <Upload size={28} className="mx-auto text-nova-muted mb-3"/>
              <p className="text-white font-body text-sm mb-1">{fileName||'Drop your manuscript here'}</p>
              <p className="text-nova-muted text-xs">{fileName?`${rawText.split(/\s+/).length.toLocaleString()} words detected`:'.txt, .md, .docx — or paste below'}</p>
              <input ref={fileRef} type="file" accept=".txt,.md,.docx,.doc" className="hidden"
                onChange={e=>{if(e.target.files?.[0])handleFile(e.target.files[0])}}/>
            </div>
            <textarea value={rawText} onChange={e=>setRawText(e.target.value)}
              placeholder="Or paste manuscript text here…"
              className="w-full h-32 bg-nova-navydark border border-nova-border rounded-lg px-4 py-3 text-sm font-body text-white placeholder-nova-muted resize-none focus:outline-none focus:border-nova-violet/50"/>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-nova-muted mb-2">AUTHOR NAME</label>
              <input value={authorName} onChange={e=>setAuthorName(e.target.value)}
                className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-nova-muted mb-2">GENRE</label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {GENRE_OPTIONS.map(g=>(
                  <button key={g.value} onClick={()=>setGenre(g.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${genre===g.value?'border-nova-violet bg-nova-violet/10 text-white':'border-nova-border/40 text-nova-muted hover:border-nova-border hover:text-white'}`}>
                    <span className="block text-xs font-body font-medium">{g.label}</span>
                    <span className="block text-[10px] font-mono text-nova-muted">{g.description}</span>
                  </button>
                ))}
              </div>
            </div>
            {voiceProfiles.length>0&&(
              <div>
                <label className="block text-xs font-mono text-nova-muted mb-2">VOICE PROFILE</label>
                <select value={activeVoice?.id||''}
                  onChange={e=>{const v=voiceProfiles.find(p=>p.id===e.target.value)||null;setActiveVoice(v);setVoiceLocked(!!v)}}
                  className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="">— No voice lock —</option>
                  {voiceProfiles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            )}
            {error&&(
              <div className="flex items-start gap-2 p-3 rounded-lg bg-nova-crimson/10 border border-nova-crimson/30">
                <AlertCircle size={14} className="text-nova-crimson mt-0.5 shrink-0"/>
                <p className="text-xs text-nova-crimson">{error}</p>
              </div>
            )}
            <button onClick={runPipeline} disabled={!rawText.trim()||isRunning}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-nova-violet text-white font-body text-sm font-medium hover:bg-nova-violet/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <Wand2 size={15}/>Rewrite to KDP Standard
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      {isRunning&&(
        <div className="space-y-3 p-5 rounded-xl bg-nova-navydark border border-nova-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-nova-violet animate-spin"/>
              <span className="text-sm font-body text-white">{statusMsg}</span>
            </div>
            <span className="text-xs font-mono text-nova-muted">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-nova-border rounded-full overflow-hidden">
            <div className="h-full bg-nova-violet rounded-full transition-all duration-500" style={{width:`${progress}%`}}/>
          </div>
          {chapters.length>0&&<p className="text-xs font-mono text-nova-muted">{chapters.length} chapter{chapters.length!==1?'s':''} done</p>}
        </div>
      )}

      {/* Results */}
      {(stage==='done'||(chapters.length>0&&isRunning))&&(
        <div className="space-y-4">

          {/* Score banner */}
          {overallScore>0&&(
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-4 rounded-xl bg-nova-navydark border border-nova-border">
                <div className="flex items-center gap-2">
                  <Star size={16} className="text-nova-gold"/>
                  <div>
                    <p className="text-sm font-body text-white">Oprah Score</p>
                    <p className="text-[10px] font-mono text-nova-muted">{SCORE_LABEL(overallScore)}</p>
                  </div>
                </div>
                <div className={`text-2xl font-display font-bold ${SCORE_COLOR(overallScore)}`}>
                  {overallScore}<span className="text-sm text-nova-muted">/10</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-nova-navydark border border-nova-border">
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-nova-teal"/>
                  <div>
                    <p className="text-sm font-body text-white">Reading Level</p>
                    <p className="text-[10px] font-mono text-nova-muted">{RL_LABEL(avgRL)}</p>
                  </div>
                </div>
                <div className="text-2xl font-display font-bold text-nova-teal">
                  G{avgRL}
                </div>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 p-1 bg-nova-navydark rounded-xl border border-nova-border overflow-x-auto">
            {([
              {id:'rewrite', label:'Chapters', icon:PenTool},
              {id:'cover',   label:'Cover',    icon:Image},
              {id:'metadata',label:'KDP Meta', icon:Tag},
              {id:'tools',   label:'Tools',    icon:Sparkles},
              {id:'export',  label:'Export',   icon:Download},
            ] as {id:ActiveTab;label:string;icon:React.ComponentType<{size:number}>}[]).map(({id,label,icon:Icon})=>(
              <button key={id} onClick={()=>setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body transition-all whitespace-nowrap ${activeTab===id?'bg-nova-violet/10 text-nova-violet':'text-nova-muted hover:text-white'}`}>
                <Icon size={12}/>{label}
              </button>
            ))}
          </div>

          {/* Tab: Chapters */}
          {activeTab==='rewrite'&&(
            <div className="space-y-3">
              {chapters.map((ch,idx)=>(
                <div key={ch.number} className="rounded-xl bg-nova-navydark border border-nova-border overflow-hidden">
                  <div className="flex items-center px-4 py-3 hover:bg-nova-border/20 transition-all">
                    <button onClick={()=>{const u=[...chapters];u[idx]={...ch,expanded:!ch.expanded};setChapters(u)}} className="flex-1 flex items-center gap-3 text-left">
                      <BookMarked size={14} className="text-nova-violet shrink-0"/>
                      <div>
                        <p className="text-sm font-body text-white">Ch {ch.number}: {ch.title}</p>
                        <p className="text-[10px] font-mono text-nova-muted">
                          {ch.original_words.toLocaleString()} → {ch.rewritten_words.toLocaleString()} words
                          {ch.rewritten_words>ch.original_words&&<span className="ml-2 text-nova-teal">+{(((ch.rewritten_words-ch.original_words)/ch.original_words)*100).toFixed(0)}%</span>}
                          <span className="ml-2 text-nova-muted">· G{ch.reading_level}</span>
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-display font-bold ${SCORE_COLOR(ch.oprah_score)}`}>{ch.oprah_score}/10</span>
                      {/* Tier 1: regen button */}
                      <button onClick={()=>regenChapter(idx)} disabled={ch.regenerating||isRunning} title="Regenerate chapter"
                        className="p-1.5 rounded-lg border border-nova-border/50 text-nova-muted hover:text-nova-violet hover:border-nova-violet/50 disabled:opacity-40 transition-all">
                        {ch.regenerating?<Loader2 size={12} className="animate-spin"/>:<RotateCcw size={12}/>}
                      </button>
                      <button onClick={()=>{const u=[...chapters];u[idx]={...ch,expanded:!ch.expanded};setChapters(u)}}>
                        {ch.expanded?<ChevronUp size={14} className="text-nova-muted"/>:<ChevronDown size={14} className="text-nova-muted"/>}
                      </button>
                    </div>
                  </div>
                  {ch.expanded&&(
                    <div className="border-t border-nova-border px-4 pb-4 pt-3 space-y-3">
                      {ch.feedback&&(
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-nova-gold/5 border border-nova-gold/20">
                          <Sparkles size={12} className="text-nova-gold mt-0.5 shrink-0"/>
                          <p className="text-xs font-body text-nova-muted">{ch.feedback}</p>
                        </div>
                      )}
                      {/* Tier 1: title suggestions */}
                      {ch.title_suggestions?.length>0&&(
                        <div>
                          <p className="text-[10px] font-mono text-nova-muted mb-1.5">ALT TITLE SUGGESTIONS — click to apply</p>
                          <div className="flex flex-wrap gap-2">
                            {ch.title_suggestions.map((t,ti)=>(
                              <button key={ti} onClick={()=>{const u=[...chapters];u[idx]={...ch,title:t};setChapters(u)}}
                                className="px-2.5 py-1 rounded-full border border-nova-border/50 text-[10px] font-body text-nova-muted hover:text-nova-violet hover:border-nova-violet/50 transition-all">{t}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="max-h-80 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-xs font-body text-white/80 leading-relaxed">{ch.rewritten_text}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tab: Cover */}
          {activeTab==='cover'&&(
            <div className="space-y-4">
              {cover?(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-nova-muted">FRONT COVER</p>
                    {cover.front_url?(
                      <div className="relative">
                        <img src={cover.front_url} alt="Cover" className="w-full rounded-xl border border-nova-border"/>
                        <a href={cover.front_url} download target="_blank" rel="noreferrer"
                          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs backdrop-blur-sm">
                          <Download size={11}/>Download
                        </a>
                      </div>
                    ):(
                      <div className="w-full aspect-[2/3] rounded-xl border border-nova-border/40 bg-nova-navydark flex flex-col items-center justify-center p-6 text-center">
                        <Image size={24} className="text-nova-muted mb-3"/>
                        <p className="text-xs font-mono text-nova-muted">Add FAL_API_KEY to Supabase secrets to enable AI covers.</p>
                      </div>
                    )}
                    {cover.tagline&&(
                      <div className="p-3 rounded-lg bg-nova-border/30 border border-nova-border/50">
                        <p className="text-[10px] font-mono text-nova-muted mb-1">TAGLINE</p>
                        <p className="text-sm font-body text-white italic">"{cover.tagline}"</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-nova-muted">BACK COVER BLURB</p>
                    <div className="p-4 rounded-xl bg-nova-navydark border border-nova-border min-h-48">
                      <p className="text-sm font-body text-white leading-relaxed">{cover.back_blurb||'No blurb generated.'}</p>
                    </div>
                    <button onClick={async()=>{
                      if(!metadata||!cover)return
                      try{const r=await claude(`New back cover blurb for "${metadata.title}" (${metadata.genre}). 80-100 words, present tense, third person, ends with a question. Return ONLY the blurb text.`); setCover({...cover,back_blurb:r})}catch{/**/}
                    }} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-nova-border text-nova-muted text-xs hover:text-white hover:border-nova-violet/50 transition-all">
                      <RefreshCw size={11}/>Regenerate Blurb
                    </button>
                  </div>
                </div>
              ):(
                <div className="flex items-center justify-center h-48 rounded-xl border border-nova-border/40">
                  <p className="text-xs font-mono text-nova-muted">Cover appears after processing…</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: KDP Metadata */}
          {activeTab==='metadata'&&metadata&&(
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['title','subtitle','bisac','genre'] as (keyof KDPMetadata)[]).map(k=>(
                  <div key={String(k)} className="space-y-1">
                    <label className="text-[10px] font-mono text-nova-muted">{String(k).toUpperCase()}</label>
                    <input value={String(metadata[k])||''}
                      onChange={e=>setMetadata({...metadata,[k]:e.target.value})}
                      className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"/>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-nova-muted">KDP CATEGORIES (2 MAX)</label>
                {metadata.categories.map((cat,i)=>(
                  <div key={i} className="flex gap-2">
                    <input value={cat} onChange={e=>{const u=[...metadata.categories];u[i]=e.target.value;setMetadata({...metadata,categories:u})}}
                      className="flex-1 bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"/>
                    <button onClick={()=>setMetadata({...metadata,categories:metadata.categories.filter((_,j)=>j!==i)})}
                      className="p-2 rounded-lg border border-nova-border text-nova-muted hover:text-nova-crimson transition-all"><X size={12}/></button>
                  </div>
                ))}
                {metadata.categories.length<2&&<button onClick={()=>setMetadata({...metadata,categories:[...metadata.categories,'']})}
                  className="flex items-center gap-1.5 text-xs text-nova-violet hover:text-white transition-all"><Plus size={11}/>Add category</button>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-nova-muted">KEYWORDS (7 MAX)</label>
                <div className="flex flex-wrap gap-2">
                  {metadata.keywords.map((kw,i)=>(
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-nova-border/50 text-xs text-white">
                      {kw}<button onClick={()=>setMetadata({...metadata,keywords:metadata.keywords.filter((_,j)=>j!==i)})}><X size={10} className="text-nova-muted hover:text-nova-crimson"/></button>
                    </div>
                  ))}
                  {metadata.keywords.length<7&&<button
                    onClick={()=>{const kw=prompt('Add keyword:');if(kw)setMetadata({...metadata,keywords:[...metadata.keywords,kw]})}}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-nova-border text-xs text-nova-muted hover:text-nova-violet hover:border-nova-violet/50 transition-all">
                    <Plus size={10}/>Add
                  </button>}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-nova-muted">AMAZON DESCRIPTION</label>
                <textarea value={metadata.description} onChange={e=>setMetadata({...metadata,description:e.target.value})}
                  rows={6} className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50 resize-none"/>
                <p className="text-[10px] font-mono text-nova-muted text-right">{metadata.description.split(/\s+/).filter(Boolean).length} words</p>
              </div>
            </div>
          )}

          {/* Tab: Tools — Tier 1 */}
          {activeTab==='tools'&&(
            <div className="space-y-5">

              {/* Voice Lock */}
              <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-4">
                <div className="flex items-center gap-2">
                  <Mic2 size={16} className="text-nova-gold"/>
                  <p className="text-sm font-body text-white font-medium">Voice Lock</p>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-nova-gold/20 text-nova-gold">TIER 1</span>
                </div>
                <p className="text-xs font-mono text-nova-muted">Capture your writing fingerprint. Lock it so every chapter regeneration preserves your exact voice.</p>
                {activeVoice&&voiceLocked?(
                  <div className="p-3 rounded-lg bg-nova-gold/5 border border-nova-gold/20 space-y-1">
                    <p className="text-xs font-body text-nova-gold font-medium">🔒 {activeVoice.name}</p>
                    <p className="text-[10px] font-mono text-nova-muted">Tone: {activeVoice.tone} · POV: {activeVoice.pov}</p>
                    <p className="text-[10px] font-mono text-nova-muted">Sentences: {activeVoice.sentences} · Vocabulary: {activeVoice.vocabulary}</p>
                    <p className="text-xs font-body text-white/70 mt-1">{activeVoice.fingerprint}</p>
                    <button onClick={()=>{setVoiceLocked(false);setActiveVoice(null)}}
                      className="mt-1 text-[10px] font-mono text-nova-muted hover:text-nova-crimson">Unlock</button>
                  </div>
                ):(
                  <div className="flex gap-2">
                    <input value={newVoiceName} onChange={e=>setNewVoiceName(e.target.value)}
                      placeholder="e.g. CJ Adisa — Thriller Voice"
                      className="flex-1 bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-gold/50"/>
                    <button onClick={captureVoice} disabled={capturingVoice||!newVoiceName.trim()||!chapters.length}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-nova-gold/10 border border-nova-gold/30 text-nova-gold text-sm hover:bg-nova-gold/20 disabled:opacity-50 transition-all">
                      {capturingVoice?<Loader2 size={13} className="animate-spin"/>:<Lock size={13}/>}Capture
                    </button>
                  </div>
                )}
                {voiceProfiles.length>0&&(
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono text-nova-muted">SAVED PROFILES</p>
                    {voiceProfiles.map(v=>(
                      <div key={v.id} className="flex items-center justify-between p-2.5 rounded-lg border border-nova-border/40">
                        <div><p className="text-xs font-body text-white">{v.name}</p><p className="text-[10px] font-mono text-nova-muted">{v.genre} · {v.tone}</p></div>
                        <div className="flex gap-3">
                          <button onClick={()=>{setActiveVoice(v);setVoiceLocked(true)}} className="text-[10px] font-mono text-nova-violet hover:text-white">Apply</button>
                          <button onClick={()=>{const u=voiceProfiles.filter(p=>p.id!==v.id);setVoiceProfiles(u);persist({voiceProfiles:u});if(activeVoice?.id===v.id){setActiveVoice(null);setVoiceLocked(false)}}}
                            className="text-[10px] font-mono text-nova-muted hover:text-nova-crimson">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Comp Title Matcher */}
              <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-nova-violet"/>
                    <p className="text-sm font-body text-white font-medium">Comp Title Matcher</p>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-nova-violet/20 text-nova-violet">TIER 1</span>
                  </div>
                  <button onClick={fetchComps} disabled={compLoading||!metadata}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nova-violet/10 border border-nova-violet/30 text-nova-violet text-xs hover:bg-nova-violet/20 disabled:opacity-50 transition-all">
                    {compLoading?<Loader2 size={11} className="animate-spin"/>:<Sparkles size={11}/>}
                    {compTitles.length?'Refresh':'Find Comp Titles'}
                  </button>
                </div>
                <p className="text-xs font-mono text-nova-muted">3 Amazon bestsellers your book competes with — for KDP description, ads, and reader targeting.</p>
                {compTitles.length>0?(
                  <div className="space-y-3">
                    {compTitles.map((ct,i)=>(
                      <div key={i} className="p-3 rounded-lg bg-nova-border/20 border border-nova-border/40 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-body text-white font-medium">{ct.title}</p>
                          <span className="text-[10px] font-mono text-nova-gold shrink-0">{ct.rank}</span>
                        </div>
                        <p className="text-xs font-mono text-nova-muted">by {ct.author}</p>
                        <p className="text-[10px] text-nova-muted/70">{ct.category}</p>
                        <p className="text-xs font-body text-white/70 italic">{ct.why}</p>
                      </div>
                    ))}
                    <div className="p-3 rounded-lg bg-nova-violet/5 border border-nova-violet/20">
                      <p className="text-[10px] font-mono text-nova-muted">ADD TO KDP DESCRIPTION</p>
                      <p className="text-xs font-body text-white/80 mt-1 italic">
                        "Perfect for fans of {compTitles.map(c=>c.author).join(', ')}."
                      </p>
                    </div>
                  </div>
                ):<p className="text-xs font-mono text-nova-muted">Click "Find Comp Titles" to identify your Amazon competition.</p>}
              </div>

              {/* Reading Level */}
              <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-4">
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-nova-teal"/>
                  <p className="text-sm font-body text-white font-medium">Reading Level Analysis</p>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-nova-teal/20 text-nova-teal">TIER 1</span>
                </div>
                <p className="text-xs font-mono text-nova-muted">Flesch-Kincaid grade level per chapter. Target your exact audience. Ensure consistency.</p>
                <div className="space-y-2">
                  {chapters.map(ch=>(
                    <div key={ch.number} className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-nova-muted w-20 shrink-0">Ch {ch.number}</span>
                      <div className="flex-1 h-2 bg-nova-border rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${ch.reading_level<=8?'bg-nova-teal':ch.reading_level<=12?'bg-nova-gold':'bg-nova-crimson'}`}
                          style={{width:`${Math.min(100,ch.reading_level*6.25)}%`}}/>
                      </div>
                      <span className="text-[10px] font-mono w-28 shrink-0 text-white">G{ch.reading_level} {RL_LABEL(ch.reading_level)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 pt-1">
                  {[['bg-nova-teal','≤8 YA/MG'],['bg-nova-gold','9-12 Adult'],['bg-nova-crimson','13+ Dense']].map(([c,l])=>(
                    <div key={l} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${c}`}/><span className="text-[10px] font-mono text-nova-muted">{l}</span></div>
                  ))}
                </div>
              </div>

              {/* Series Tracker */}
              <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Library size={16} className="text-nova-crimson"/>
                    <p className="text-sm font-body text-white font-medium">Series Tracker</p>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-nova-crimson/20 text-nova-crimson">TIER 1</span>
                  </div>
                  <button onClick={()=>setShowSeries(!showSeries)} className="text-[10px] font-mono text-nova-muted hover:text-white transition-all">
                    {showSeries?'Collapse':'Expand'}
                  </button>
                </div>
                <input value={seriesName} onChange={e=>{setSeriesName(e.target.value);persist({seriesName:e.target.value})}}
                  placeholder="Series name"
                  className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-crimson/50"/>
                {showSeries&&(
                  seriesBooks.length>0?(
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono text-nova-muted">{seriesBooks.length} BOOK{seriesBooks.length!==1?'S':''} — {seriesName.toUpperCase()}</p>
                      {seriesBooks.map((b,i)=>(
                        <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-nova-border/20 border border-nova-border/40">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-nova-crimson/20 text-nova-crimson text-[10px] font-display flex items-center justify-center">{i+1}</span>
                            <div>
                              <p className="text-sm font-body text-white">{b.title}</p>
                              <p className="text-[10px] font-mono text-nova-muted">{b.wordCount.toLocaleString()} words · Score {b.oprahScore}/10 · {new Date(b.savedAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${b.status==='complete'?'bg-green-400/20 text-green-400':b.status==='in_progress'?'bg-nova-gold/20 text-nova-gold':'bg-nova-border/50 text-nova-muted'}`}>{b.status}</span>
                            {b.driveUrl&&<a href={b.driveUrl} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-nova-teal hover:underline">Drive</a>}
                            <button onClick={()=>{const u=seriesBooks.filter((_,j)=>j!==i);setSeriesBooks(u);persist({seriesBooks:u})}} className="text-[10px] font-mono text-nova-muted hover:text-nova-crimson">✕</button>
                          </div>
                        </div>
                      ))}
                      <div className="p-3 rounded-lg bg-nova-crimson/5 border border-nova-crimson/20">
                        <p className="text-[10px] font-mono text-nova-muted mb-1">KDP SERIES TIP</p>
                        <p className="text-xs font-body text-white/70">Set Series Name to "{seriesName}" on every KDP listing to unlock the Series Page and automatic cross-sells between books.</p>
                      </div>
                    </div>
                  ):<p className="text-xs font-mono text-nova-muted">Books are added automatically when you save to Drive. Nothing tracked yet.</p>
                )}
              </div>

            </div>
          )}

          {/* Tab: Export */}
          {activeTab==='export'&&(
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-nova-navydark border border-nova-violet/30 space-y-3">
                  <div className="flex items-center gap-2"><BookCopy size={16} className="text-nova-violet"/><p className="text-sm font-body text-white font-medium">EPUB — Kindle Ready</p><span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-nova-violet/20 text-nova-violet">PRIMARY</span></div>
                  <p className="text-xs font-mono text-nova-muted">Single-file EPUB HTML · TOC · KDP direct upload</p>
                  <button onClick={downloadEpub} disabled={epubStatus==='building'}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-nova-violet text-white text-sm hover:bg-nova-violet/80 disabled:opacity-50 transition-all">
                    {epubStatus==='building'?<Loader2 size={13} className="animate-spin"/>:<Download size={13}/>}
                    {epubStatus==='building'?'Building…':epubStatus==='done'?'Download Again':'Download EPUB'}
                  </button>
                </div>
                <div className="p-5 rounded-xl bg-nova-navydark border border-nova-teal/30 space-y-3">
                  <div className="flex items-center gap-2"><Cloud size={16} className="text-nova-teal"/><p className="text-sm font-body text-white font-medium">Save to Google Drive</p></div>
                  <p className="text-xs font-mono text-nova-muted">→ <span className="text-nova-teal">C.H.A. LLC Books</span> · Auto-adds to Series Tracker</p>
                  <button onClick={saveToDrive} disabled={driveStatus==='uploading'}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all ${driveStatus==='done'?'bg-nova-teal/10 border border-nova-teal/40 text-nova-teal':'bg-nova-teal text-white hover:bg-nova-teal/80 disabled:opacity-50'}`}>
                    {driveStatus==='uploading'?<Loader2 size={13} className="animate-spin"/>:driveStatus==='done'?<CheckCircle size={13}/>:<Cloud size={13}/>}
                    {driveStatus==='uploading'?'Saving…':driveStatus==='done'?'Saved ✓':'Save to Drive'}
                  </button>
                  {driveStatus==='done'&&driveFileUrl&&<a href={driveFileUrl} target="_blank" rel="noreferrer" className="block text-center text-[10px] font-mono text-nova-teal hover:underline">Open in Drive →</a>}
                </div>
                <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                  <div className="flex items-center gap-2"><FileText size={16} className="text-nova-gold"/><p className="text-sm font-body text-white font-medium">Manuscript (.txt)</p></div>
                  <p className="text-xs font-mono text-nova-muted">{chapters.reduce((s,c)=>s+c.rewritten_words,0).toLocaleString()} words · {chapters.length} chapters</p>
                  <button onClick={exportTxt}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-nova-gold/10 border border-nova-gold/30 text-nova-gold text-sm hover:bg-nova-gold/20 transition-all">
                    <Download size={13}/>Download .txt
                  </button>
                </div>
                {metadata&&(
                  <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                    <div className="flex items-center gap-2"><Tag size={16} className="text-nova-muted"/><p className="text-sm font-body text-white font-medium">KDP Metadata (.json)</p></div>
                    <button onClick={()=>{const b=new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${(metadata.title||'book').replace(/[^a-z0-9]/gi,'_')}_kdp.json`;a.click()}}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-nova-border/50 text-nova-muted text-sm hover:text-white hover:border-nova-border transition-all">
                      <Download size={13}/>Download JSON
                    </button>
                  </div>
                )}
                {cover?.front_url&&(
                  <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                    <div className="flex items-center gap-2"><LayoutTemplate size={16} className="text-nova-teal"/><p className="text-sm font-body text-white font-medium">Book Cover (fal.ai)</p></div>
                    <a href={cover.front_url} download target="_blank" rel="noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-nova-teal/10 border border-nova-teal/30 text-nova-teal text-sm hover:bg-nova-teal/20 transition-all">
                      <Download size={13}/>Download Cover
                    </a>
                  </div>
                )}
                <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                  <div className="flex items-center gap-2"><RefreshCw size={16} className="text-nova-muted"/><p className="text-sm font-body text-white font-medium">New Manuscript</p></div>
                  <button onClick={()=>{setStage('idle');setRawText('');setFileName('');setChapters([]);setCover(null);setMetadata(null);setOverallScore(0);setAvgRL(0);setProgress(0);setError('');setDriveStatus('idle');setDriveFileUrl('');setEpubStatus('idle');setCompTitles([])}}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-nova-border/50 text-nova-muted text-sm hover:text-white hover:border-nova-border transition-all">
                    <Plus size={13}/>New Manuscript
                  </button>
                </div>
              </div>
              {stage==='done'&&(
                <div className="p-4 rounded-xl bg-nova-navydark border border-nova-border">
                  <p className="text-[10px] font-mono text-nova-muted mb-3">PIPELINE SUMMARY</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[{label:'Chapters',value:chapters.length},{label:'Final Words',value:chapters.reduce((s,c)=>s+c.rewritten_words,0).toLocaleString()},{label:'Oprah Score',value:`${overallScore}/10`},{label:'Read Level',value:`Grade ${avgRL}`}].map(({label,value})=>(
                      <div key={label} className="text-center"><p className="text-lg font-display text-nova-gold">{value}</p><p className="text-[10px] font-mono text-nova-muted">{label}</p></div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-nova-violet/5 border border-nova-violet/20">
                    <CheckCircle size={14} className="text-nova-violet shrink-0 mt-0.5"/>
                    <p className="text-xs font-body text-nova-muted">
                      <strong className="text-white">EPUB</strong> for KDP · <strong className="text-white">.txt</strong> for Word · <strong className="text-white">JSON</strong> for KDP form · Auto-saved to <strong className="text-nova-teal">C.H.A. LLC Books</strong> Drive folder · Added to Series Tracker.
                    </p>
                    <ArrowRight size={12} className="text-nova-violet shrink-0 mt-0.5"/>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
