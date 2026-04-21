import { useState, useRef, useCallback } from 'react'
import {
  BookOpen, Upload, Wand2, FileText, Image, Loader2,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Download, Star, RefreshCw, Sparkles, BookMarked,
  PenTool, LayoutTemplate, Tag, ArrowRight, X, Plus
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────
type Genre =
  | 'thriller' | 'mystery' | 'literary_fiction'
  | 'romance' | 'sci_fi' | 'historical_fiction'
  | 'memoir' | 'self_help' | 'crime'

type ProcessingStage =
  | 'idle' | 'parsing' | 'rewriting'
  | 'scoring' | 'cover_gen' | 'formatting' | 'done' | 'error'

type ChapterResult = {
  number: number
  title: string
  original_words: number
  rewritten_words: number
  oprah_score: number   // 1-10
  feedback: string
  rewritten_text: string
  expanded: boolean
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

const GENRE_OPTIONS: { value: Genre; label: string; description: string }[] = [
  { value: 'thriller',          label: 'Thriller',          description: 'Tense, fast-paced, high-stakes' },
  { value: 'mystery',           label: 'Mystery',           description: 'Puzzle-driven, investigative' },
  { value: 'literary_fiction',  label: 'Literary Fiction',  description: 'Character-driven, prose-forward' },
  { value: 'crime',             label: 'Crime',             description: 'Procedural, gritty, investigative' },
  { value: 'romance',           label: 'Romance',           description: 'Emotional, relationship-centred' },
  { value: 'sci_fi',            label: 'Science Fiction',   description: 'Speculative, world-building' },
  { value: 'historical_fiction',label: 'Historical Fiction','description': 'Period-accurate, character-rich' },
  { value: 'memoir',            label: 'Memoir / Narrative','description': 'First-person, truth-driven voice' },
  { value: 'self_help',         label: 'Self-Help',         description: 'Actionable, transformational' },
]

const SCORE_COLOR = (s: number) =>
  s >= 9 ? 'text-green-400' :
  s >= 7 ? 'text-nova-gold' :
  s >= 5 ? 'text-yellow-500' : 'text-nova-crimson'

const SCORE_LABEL = (s: number) =>
  s >= 9 ? 'Oprah-Worthy' :
  s >= 7 ? 'Highly Marketable' :
  s >= 5 ? 'Solid — Polish Needed' : 'Needs Major Work'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Component ────────────────────────────────────────────────────────────────
export default function BookEditor() {
  // Upload
  const [rawText, setRawText]     = useState('')
  const [fileName, setFileName]   = useState('')
  const [genre, setGenre]         = useState<Genre>('thriller')
  const [authorName, setAuthorName] = useState('C.J.H. Adisa')
  const fileRef = useRef<HTMLInputElement>(null)

  // Processing
  const [stage, setStage]         = useState<ProcessingStage>('idle')
  const [progress, setProgress]   = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError]         = useState('')

  // Results
  const [chapters, setChapters]   = useState<ChapterResult[]>([])
  const [cover, setCover]         = useState<CoverResult | null>(null)
  const [metadata, setMetadata]   = useState<KDPMetadata | null>(null)
  const [overallScore, setOverallScore] = useState(0)

  // UI
  const [activeTab, setActiveTab] = useState<'rewrite' | 'cover' | 'metadata' | 'export'>('rewrite')

  // ── File upload ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file) return
    setFileName(file.name)
    setError('')

    const text = await file.text()
    // Strip any docx XML artifacts if present — keep plain text
    const clean = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, '\n')
      .trim()
    setRawText(clean)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  // ── Main pipeline ────────────────────────────────────────────────────────
  const runPipeline = async () => {
    if (!rawText.trim()) { setError('Please upload a manuscript first.'); return }
    setError('')
    setChapters([])
    setCover(null)
    setMetadata(null)
    setOverallScore(0)
    setActiveTab('rewrite')

    try {
      // ── 1. Parse chapters ──────────────────────────────────────────────
      setStage('parsing')
      setProgress(5)
      setStatusMsg('Parsing manuscript structure…')

      const parseRes = await callClaude(`
You are a professional manuscript editor.

Parse this manuscript into chapters. Return ONLY valid JSON — no markdown, no explanation.

Format:
{
  "title": "book title",
  "chapters": [
    { "number": 1, "title": "Chapter title", "text": "full chapter text" }
  ]
}

If chapters are not clearly marked, infer them from content breaks.
Maximum 20 chapters. If manuscript is one block, create logical chapter divisions.

MANUSCRIPT:
${rawText.slice(0, 40000)}
`)

      let parsed: { title: string; chapters: { number: number; title: string; text: string }[] }
      try {
        parsed = JSON.parse(parseRes)
      } catch {
        throw new Error('Could not parse manuscript structure. Please ensure your file contains readable text.')
      }

      const chaptersRaw = parsed.chapters || []
      if (chaptersRaw.length === 0) throw new Error('No chapters found in manuscript.')

      // ── 2. Rewrite each chapter ────────────────────────────────────────
      setStage('rewriting')
      setStatusMsg(`Rewriting ${chaptersRaw.length} chapters to ${genre.replace('_', ' ')} industry standard…`)

      const genreLabel = GENRE_OPTIONS.find(g => g.value === genre)?.label || 'Fiction'
      const rewritten: ChapterResult[] = []

      for (let i = 0; i < chaptersRaw.length; i++) {
        const ch = chaptersRaw[i]
        setProgress(10 + Math.round((i / chaptersRaw.length) * 55))
        setStatusMsg(`Rewriting Chapter ${ch.number}: ${ch.title}…`)

        const rewriteRes = await callClaude(`
You are a world-class ${genreLabel} editor. Your standard is the Oprah Book Club — books that are bingeable, emotionally resonant, commercially viable, and literarily excellent.

Rewrite this chapter to meet that standard. Requirements:
- Genre: ${genreLabel}
- Add vivid scene-setting and sensory detail
- Write natural, character-revealing dialogue
- Remove purple prose and repetition
- Ensure every paragraph advances plot or character
- Open with a hook, close with a question or tension
- Expand to full scene-level dramatisation (minimum 3x word count of original if under 1000 words)
- Maintain the author's voice: C.J.H. Adisa — direct, purposeful, grounded in lived experience
- Keep chapter title

Return ONLY valid JSON:
{
  "title": "chapter title",
  "rewritten_text": "the full rewritten chapter",
  "oprah_score": 8,
  "feedback": "brief 2-sentence editorial note on what was improved and what still needs attention"
}

ORIGINAL CHAPTER ${ch.number}: ${ch.title}
${ch.text}
`)

        let rObj: { title: string; rewritten_text: string; oprah_score: number; feedback: string }
        try {
          rObj = JSON.parse(rewriteRes)
        } catch {
          rObj = {
            title: ch.title,
            rewritten_text: ch.text,
            oprah_score: 5,
            feedback: 'Rewrite returned in unexpected format — original preserved.'
          }
        }

        rewritten.push({
          number: ch.number,
          title: rObj.title || ch.title,
          original_words: ch.text.split(/\s+/).length,
          rewritten_words: rObj.rewritten_text.split(/\s+/).length,
          oprah_score: Math.min(10, Math.max(1, rObj.oprah_score || 5)),
          feedback: rObj.feedback || '',
          rewritten_text: rObj.rewritten_text || ch.text,
          expanded: false,
        })

        setChapters([...rewritten])
      }

      // ── 3. Scoring pass ────────────────────────────────────────────────
      setStage('scoring')
      setProgress(68)
      setStatusMsg('Running Oprah Book Club quality assessment…')

      const avg = Math.round(
        rewritten.reduce((s, c) => s + c.oprah_score, 0) / rewritten.length
      )
      setOverallScore(avg)

      // ── 4. KDP Metadata ────────────────────────────────────────────────
      setProgress(72)
      setStatusMsg('Generating KDP metadata, keywords, and back cover blurb…')

      const firstChText = rewritten[0]?.rewritten_text?.slice(0, 2000) || ''
      const metaRes = await callClaude(`
You are a professional book publishing strategist specialising in Amazon KDP.

Based on this manuscript information, generate complete KDP publishing metadata.
Return ONLY valid JSON — no markdown.

Book title: ${parsed.title}
Author: ${authorName}
Genre: ${genreLabel}
First chapter excerpt: ${firstChText}

Return:
{
  "title": "final book title",
  "subtitle": "compelling subtitle",
  "author": "${authorName}",
  "genre": "${genreLabel}",
  "categories": ["Primary KDP category", "Secondary KDP category"],
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7"],
  "description": "Full Amazon book description, 150-200 words, hooks the reader, reveals stakes, ends with a question",
  "bisac": "BISAC code e.g. FIC031010"
}
`)

      let meta: KDPMetadata
      try {
        meta = JSON.parse(metaRes)
      } catch {
        meta = {
          title: parsed.title,
          subtitle: '',
          author: authorName,
          genre: genreLabel,
          categories: [`Fiction > ${genreLabel}`, 'Literature & Fiction'],
          keywords: [genreLabel, 'novel', authorName, 'fiction', 'C.H.A. LLC', 'thriller', 'mystery'],
          description: 'A compelling work of fiction.',
          bisac: 'FIC000000'
        }
      }
      setMetadata(meta)

      // ── 5. Cover generation via fal.ai ─────────────────────────────────
      setStage('cover_gen')
      setProgress(78)
      setStatusMsg('Generating front cover art via fal.ai…')

      let coverResult: CoverResult = {
        front_url: '',
        back_blurb: '',
        tagline: ''
      }

      try {
        const coverPromptRes = await callClaude(`
Generate a vivid, specific image generation prompt for a ${genreLabel} book cover.
The book is titled: "${meta.title}" by ${authorName}.
Genre: ${genreLabel}

Return ONLY valid JSON:
{
  "image_prompt": "detailed fal.ai prompt, cinematic, dramatic lighting, book cover composition, no text, professional",
  "tagline": "one-line tagline under 12 words",
  "back_blurb": "back cover blurb, 80-100 words, present tense, third person, ends with a question"
}
`)
        const coverMeta = JSON.parse(coverPromptRes)

        // Call nova-image edge function (which calls fal.ai)
        const imgRes = await fetch(`${SUPABASE_URL}/functions/v1/nova-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            prompt: coverMeta.image_prompt,
            aspect_ratio: '2:3',   // book cover portrait
            source: 'book-editor'
          })
        })

        if (imgRes.ok) {
          const imgData = await imgRes.json()
          coverResult = {
            front_url: imgData.url || imgData.image_url || '',
            back_blurb: coverMeta.back_blurb || '',
            tagline: coverMeta.tagline || ''
          }
        } else {
          // fal.ai not available — use placeholder
          coverResult.back_blurb = coverMeta.back_blurb || ''
          coverResult.tagline = coverMeta.tagline || ''
        }
      } catch {
        // Non-fatal — continue without cover image
      }

      setCover(coverResult)

      // ── 6. Done ────────────────────────────────────────────────────────
      setStage('done')
      setProgress(100)
      setStatusMsg('Complete.')

    } catch (err: unknown) {
      setStage('error')
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    }
  }

  // ── Claude API helper ────────────────────────────────────────────────────
  const callClaude = async (prompt: string): Promise<string> => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
    const data = await res.json()
    const block = data.content?.find((b: { type: string }) => b.type === 'text')
    const raw = (block?.text || '').trim()
    // Strip markdown code fences if present
    return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }

  // ── Export rewritten manuscript as plain text ────────────────────────────
  const exportManuscript = () => {
    if (!chapters.length) return
    const full = chapters.map(c =>
      `# Chapter ${c.number}: ${c.title}\n\n${c.rewritten_text}`
    ).join('\n\n---\n\n')
    const blob = new Blob([full], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileName.replace(/\.[^.]+$/, '')}_KDP_Rewrite.txt`
    a.click()
  }

  const isRunning = ['parsing', 'rewriting', 'scoring', 'cover_gen', 'formatting'].includes(stage)

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-nova-violet/20 flex items-center justify-center">
            <BookOpen size={18} className="text-nova-violet" />
          </div>
          <div>
            <h1 className="font-display text-white text-xl tracking-wide">BOOK EDITOR</h1>
            <p className="text-[11px] font-mono text-nova-muted">KDP MANUSCRIPT REWRITER · OPRAH STANDARD · COVER GEN</p>
          </div>
        </div>
        {stage === 'done' && (
          <button
            onClick={exportManuscript}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-nova-gold/10 border border-nova-gold/30 text-nova-gold text-sm font-body hover:bg-nova-gold/20 transition-all"
          >
            <Download size={14} />
            Export Manuscript
          </button>
        )}
      </div>

      {/* Setup panel — only show when idle or error */}
      {(stage === 'idle' || stage === 'error') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Upload */}
          <div className="lg:col-span-2 space-y-4">
            <div
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-nova-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-nova-violet/50 hover:bg-nova-violet/5 transition-all"
            >
              <Upload size={28} className="mx-auto text-nova-muted mb-3" />
              <p className="text-white font-body text-sm mb-1">
                {fileName ? fileName : 'Drop your manuscript here'}
              </p>
              <p className="text-nova-muted text-xs">
                {fileName
                  ? `${rawText.split(/\s+/).length.toLocaleString()} words detected`
                  : '.txt, .md, .docx, or paste text below'}
              </p>
              <input
                ref={fileRef} type="file"
                accept=".txt,.md,.docx,.doc"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
              />
            </div>

            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Or paste your manuscript text directly here…"
              className="w-full h-36 bg-nova-navydark border border-nova-border rounded-lg px-4 py-3 text-sm font-body text-white placeholder-nova-muted resize-none focus:outline-none focus:border-nova-violet/50"
            />
          </div>

          {/* Options */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-nova-muted mb-2">AUTHOR NAME</label>
              <input
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-nova-muted mb-2">GENRE & STANDARD</label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {GENRE_OPTIONS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setGenre(g.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                      genre === g.value
                        ? 'border-nova-violet bg-nova-violet/10 text-white'
                        : 'border-nova-border/40 text-nova-muted hover:border-nova-border hover:text-white'
                    }`}
                  >
                    <span className="block text-xs font-body font-medium">{g.label}</span>
                    <span className="block text-[10px] font-mono text-nova-muted">{g.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-nova-crimson/10 border border-nova-crimson/30">
                <AlertCircle size={14} className="text-nova-crimson mt-0.5 shrink-0" />
                <p className="text-xs text-nova-crimson">{error}</p>
              </div>
            )}

            <button
              onClick={runPipeline}
              disabled={!rawText.trim() || isRunning}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-nova-violet text-white font-body text-sm font-medium hover:bg-nova-violet/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Wand2 size={15} />
              Rewrite to KDP Standard
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-3 p-5 rounded-xl bg-nova-navydark border border-nova-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-nova-violet animate-spin" />
              <span className="text-sm font-body text-white">{statusMsg}</span>
            </div>
            <span className="text-xs font-mono text-nova-muted">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-nova-border rounded-full overflow-hidden">
            <div
              className="h-full bg-nova-violet rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {chapters.length > 0 && (
            <p className="text-xs font-mono text-nova-muted">
              {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} rewritten so far
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {(stage === 'done' || (chapters.length > 0 && isRunning)) && (
        <div className="space-y-4">

          {/* Overall score */}
          {overallScore > 0 && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-nova-navydark border border-nova-border">
              <div className="flex items-center gap-3">
                <Star size={20} className="text-nova-gold" />
                <div>
                  <p className="text-sm font-body text-white font-medium">Overall Quality Score</p>
                  <p className="text-xs font-mono text-nova-muted">{SCORE_LABEL(overallScore)}</p>
                </div>
              </div>
              <div className={`text-3xl font-display font-bold ${SCORE_COLOR(overallScore)}`}>
                {overallScore}<span className="text-base text-nova-muted">/10</span>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-nova-navydark rounded-xl border border-nova-border">
            {[
              { id: 'rewrite', label: 'Chapters', icon: PenTool },
              { id: 'cover',   label: 'Cover',    icon: Image },
              { id: 'metadata',label: 'KDP Meta', icon: Tag },
              { id: 'export',  label: 'Export',   icon: Download },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as typeof activeTab)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body transition-all ${
                  activeTab === id
                    ? 'bg-nova-violet/10 text-nova-violet'
                    : 'text-nova-muted hover:text-white'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Chapters */}
          {activeTab === 'rewrite' && (
            <div className="space-y-3">
              {chapters.map((ch, idx) => (
                <div key={ch.number} className="rounded-xl bg-nova-navydark border border-nova-border overflow-hidden">
                  <button
                    onClick={() => {
                      const updated = [...chapters]
                      updated[idx] = { ...ch, expanded: !ch.expanded }
                      setChapters(updated)
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-nova-border/20 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <BookMarked size={14} className="text-nova-violet shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-body text-white">
                          Ch {ch.number}: {ch.title}
                        </p>
                        <p className="text-[10px] font-mono text-nova-muted">
                          {ch.original_words.toLocaleString()} → {ch.rewritten_words.toLocaleString()} words
                          {ch.rewritten_words > ch.original_words && (
                            <span className="ml-2 text-nova-teal">
                              +{(((ch.rewritten_words - ch.original_words) / ch.original_words) * 100).toFixed(0)}% expanded
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-display font-bold ${SCORE_COLOR(ch.oprah_score)}`}>
                        {ch.oprah_score}/10
                      </div>
                      {ch.expanded ? <ChevronUp size={14} className="text-nova-muted" /> : <ChevronDown size={14} className="text-nova-muted" />}
                    </div>
                  </button>

                  {ch.expanded && (
                    <div className="border-t border-nova-border px-4 pb-4 pt-3 space-y-3">
                      {ch.feedback && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-nova-gold/5 border border-nova-gold/20">
                          <Sparkles size={12} className="text-nova-gold mt-0.5 shrink-0" />
                          <p className="text-xs font-body text-nova-muted">{ch.feedback}</p>
                        </div>
                      )}
                      <div className="max-h-80 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-xs font-body text-white/80 leading-relaxed">
                          {ch.rewritten_text}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tab: Cover */}
          {activeTab === 'cover' && (
            <div className="space-y-4">
              {cover ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Front cover */}
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-nova-muted">FRONT COVER</p>
                    {cover.front_url ? (
                      <div className="relative">
                        <img
                          src={cover.front_url}
                          alt="Book cover"
                          className="w-full rounded-xl border border-nova-border"
                        />
                        <a
                          href={cover.front_url}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs backdrop-blur-sm"
                        >
                          <Download size={11} />
                          Download
                        </a>
                      </div>
                    ) : (
                      <div className="w-full aspect-[2/3] rounded-xl border border-nova-border/40 bg-nova-navydark flex flex-col items-center justify-center text-center p-6">
                        <Image size={24} className="text-nova-muted mb-3" />
                        <p className="text-xs font-mono text-nova-muted">
                          Add FAL_API_KEY to Supabase secrets to enable AI cover generation.
                        </p>
                      </div>
                    )}
                    {cover.tagline && (
                      <div className="p-3 rounded-lg bg-nova-border/30 border border-nova-border/50">
                        <p className="text-[10px] font-mono text-nova-muted mb-1">TAGLINE</p>
                        <p className="text-sm font-body text-white italic">"{cover.tagline}"</p>
                      </div>
                    )}
                  </div>

                  {/* Back cover blurb */}
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-nova-muted">BACK COVER BLURB</p>
                    {cover.back_blurb ? (
                      <div className="p-4 rounded-xl bg-nova-navydark border border-nova-border min-h-48">
                        <p className="text-sm font-body text-white leading-relaxed">{cover.back_blurb}</p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-nova-navydark border border-nova-border min-h-48 flex items-center justify-center">
                        <p className="text-xs font-mono text-nova-muted">Blurb generation pending…</p>
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        setStatusMsg('Regenerating cover…')
                        try {
                          const res = await callClaude(`
Write a new, more compelling back cover blurb for this book.
Title: ${metadata?.title}
Genre: ${metadata?.genre}
Current blurb: ${cover.back_blurb}

Requirements: 80-100 words, present tense, third person, ends with a question.
Return ONLY the blurb text, no JSON, no quotes.
`)
                          setCover({ ...cover, back_blurb: res })
                        } catch { /* silent */ }
                        setStatusMsg('')
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-nova-border text-nova-muted text-xs hover:text-white hover:border-nova-violet/50 transition-all"
                    >
                      <RefreshCw size={11} />
                      Regenerate Blurb
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 rounded-xl border border-nova-border/40">
                  <p className="text-xs font-mono text-nova-muted">Cover will appear here after processing…</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: KDP Metadata */}
          {activeTab === 'metadata' && metadata && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title / Subtitle */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-nova-muted">TITLE</label>
                  <input
                    value={metadata.title}
                    onChange={e => setMetadata({ ...metadata, title: e.target.value })}
                    className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-nova-muted">SUBTITLE</label>
                  <input
                    value={metadata.subtitle}
                    onChange={e => setMetadata({ ...metadata, subtitle: e.target.value })}
                    className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-nova-muted">BISAC CODE</label>
                  <input
                    value={metadata.bisac}
                    onChange={e => setMetadata({ ...metadata, bisac: e.target.value })}
                    className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-nova-muted">GENRE</label>
                  <input
                    value={metadata.genre}
                    onChange={e => setMetadata({ ...metadata, genre: e.target.value })}
                    className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"
                  />
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-nova-muted">KDP CATEGORIES (2 MAX)</label>
                {metadata.categories.map((cat, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={cat}
                      onChange={e => {
                        const updated = [...metadata.categories]
                        updated[i] = e.target.value
                        setMetadata({ ...metadata, categories: updated })
                      }}
                      className="flex-1 bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50"
                    />
                    <button
                      onClick={() => {
                        const updated = metadata.categories.filter((_, j) => j !== i)
                        setMetadata({ ...metadata, categories: updated })
                      }}
                      className="p-2 rounded-lg border border-nova-border text-nova-muted hover:text-nova-crimson hover:border-nova-crimson/50 transition-all"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {metadata.categories.length < 2 && (
                  <button
                    onClick={() => setMetadata({ ...metadata, categories: [...metadata.categories, ''] })}
                    className="flex items-center gap-1.5 text-xs text-nova-violet hover:text-white transition-all"
                  >
                    <Plus size={11} /> Add category
                  </button>
                )}
              </div>

              {/* Keywords */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-nova-muted">KEYWORDS (7 MAX)</label>
                <div className="flex flex-wrap gap-2">
                  {metadata.keywords.map((kw, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-nova-border/50 text-xs text-white">
                      {kw}
                      <button onClick={() => {
                        const updated = metadata.keywords.filter((_, j) => j !== i)
                        setMetadata({ ...metadata, keywords: updated })
                      }}><X size={10} className="text-nova-muted hover:text-nova-crimson" /></button>
                    </div>
                  ))}
                  {metadata.keywords.length < 7 && (
                    <button
                      onClick={() => {
                        const kw = prompt('Add keyword:')
                        if (kw) setMetadata({ ...metadata, keywords: [...metadata.keywords, kw] })
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-nova-border text-xs text-nova-muted hover:text-nova-violet hover:border-nova-violet/50 transition-all"
                    >
                      <Plus size={10} /> Add
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-nova-muted">AMAZON DESCRIPTION</label>
                <textarea
                  value={metadata.description}
                  onChange={e => setMetadata({ ...metadata, description: e.target.value })}
                  rows={6}
                  className="w-full bg-nova-navydark border border-nova-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nova-violet/50 resize-none"
                />
                <p className="text-[10px] font-mono text-nova-muted text-right">
                  {metadata.description.split(/\s+/).filter(Boolean).length} words
                </p>
              </div>
            </div>
          )}

          {/* Tab: Export */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Manuscript export */}
                <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-nova-gold" />
                    <p className="text-sm font-body text-white font-medium">Rewritten Manuscript</p>
                  </div>
                  <p className="text-xs font-mono text-nova-muted">
                    {chapters.reduce((s, c) => s + c.rewritten_words, 0).toLocaleString()} total words · {chapters.length} chapters
                  </p>
                  <button
                    onClick={exportManuscript}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-nova-gold/10 border border-nova-gold/30 text-nova-gold text-sm hover:bg-nova-gold/20 transition-all"
                  >
                    <Download size={13} />
                    Download .txt
                  </button>
                </div>

                {/* Metadata export */}
                {metadata && (
                  <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                    <div className="flex items-center gap-2">
                      <Tag size={16} className="text-nova-violet" />
                      <p className="text-sm font-body text-white font-medium">KDP Metadata</p>
                    </div>
                    <p className="text-xs font-mono text-nova-muted">
                      Title · Subtitle · Categories · Keywords · BISAC · Description
                    </p>
                    <button
                      onClick={() => {
                        const text = JSON.stringify(metadata, null, 2)
                        const blob = new Blob([text], { type: 'application/json' })
                        const a = document.createElement('a')
                        a.href = URL.createObjectURL(blob)
                        a.download = 'kdp_metadata.json'
                        a.click()
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-nova-violet/10 border border-nova-violet/30 text-nova-violet text-sm hover:bg-nova-violet/20 transition-all"
                    >
                      <Download size={13} />
                      Download JSON
                    </button>
                  </div>
                )}

                {/* Cover export */}
                {cover?.front_url && (
                  <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                    <div className="flex items-center gap-2">
                      <LayoutTemplate size={16} className="text-nova-teal" />
                      <p className="text-sm font-body text-white font-medium">Book Cover</p>
                    </div>
                    <p className="text-xs font-mono text-nova-muted">
                      fal.ai generated · KDP cover-ready
                    </p>
                    <a
                      href={cover.front_url}
                      download="book_cover.jpg"
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-nova-teal/10 border border-nova-teal/30 text-nova-teal text-sm hover:bg-nova-teal/20 transition-all"
                    >
                      <Download size={13} />
                      Download Cover
                    </a>
                  </div>
                )}

                {/* New manuscript */}
                <div className="p-5 rounded-xl bg-nova-navydark border border-nova-border space-y-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={16} className="text-nova-muted" />
                    <p className="text-sm font-body text-white font-medium">Start New</p>
                  </div>
                  <p className="text-xs font-mono text-nova-muted">
                    Clear current project and upload a new manuscript
                  </p>
                  <button
                    onClick={() => {
                      setStage('idle')
                      setRawText('')
                      setFileName('')
                      setChapters([])
                      setCover(null)
                      setMetadata(null)
                      setOverallScore(0)
                      setProgress(0)
                      setError('')
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-nova-border/50 text-nova-muted text-sm hover:text-white hover:border-nova-border transition-all"
                  >
                    <Plus size={13} />
                    New Manuscript
                  </button>
                </div>
              </div>

              {/* Summary stats */}
              {stage === 'done' && (
                <div className="p-4 rounded-xl bg-nova-navydark border border-nova-border">
                  <p className="text-[10px] font-mono text-nova-muted mb-3">PIPELINE SUMMARY</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Chapters', value: chapters.length },
                      { label: 'Final Words', value: chapters.reduce((s, c) => s + c.rewritten_words, 0).toLocaleString() },
                      { label: 'Oprah Score', value: `${overallScore}/10` },
                      { label: 'Genre', value: GENRE_OPTIONS.find(g => g.value === genre)?.label || genre },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-lg font-display text-nova-gold">{value}</p>
                        <p className="text-[10px] font-mono text-nova-muted">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-nova-violet/5 border border-nova-violet/20">
                    <CheckCircle size={14} className="text-nova-violet shrink-0" />
                    <p className="text-xs font-body text-nova-muted">
                      Manuscript rewritten to KDP industry standard. Upload the .txt export to KDP Direct Publishing
                      alongside your metadata JSON. For final .docx formatting, open in Word and apply KDP template.
                    </p>
                    <ArrowRight size={12} className="text-nova-violet shrink-0" />
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
