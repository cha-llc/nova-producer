import { useEffect, useState, useCallback } from 'react'
import {
  Brain, Sparkles, Image, Copy, Check, RefreshCw, Loader2,
  Hash, Zap, TrendingUp, ChevronDown, ChevronUp, AlertCircle,
  Play, FileText, ExternalLink, Palette, Download
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AiEpisode, NovaSocialContent } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

const SHOW_COLORS: Record<string, string> = {
  sunday_power_hour: '#C9A84C',
  motivation_court:  '#2A9D8F',
  tea_time_with_cj:  '#9B5DE5',
  confession_court:  '#C1121F',
}

const PLATFORMS = [
  { key: 'tiktok_copy',         label: 'TikTok',    icon: '🎵', limit: 150  },
  { key: 'instagram_copy',      label: 'Instagram', icon: '📸', limit: 2200 },
  { key: 'youtube_description', label: 'YouTube',   icon: '▶️', limit: 5000 },
  { key: 'linkedin_copy',       label: 'LinkedIn',  icon: '💼', limit: 3000 },
  { key: 'twitter_copy',        label: 'Twitter/X', icon: '🐦', limit: 280  },
  { key: 'pinterest_copy',      label: 'Pinterest', icon: '📌', limit: 500  },
]

type GenState = 'idle' | 'brain' | 'image' | 'canva'

export default function Studio() {
  const [episodes, setEpisodes]   = useState<AiEpisode[]>([])
  const [selected, setSelected]   = useState<AiEpisode | null>(null)
  const [social, setSocial]       = useState<NovaSocialContent | null>(null)
  const [loading, setLoading]     = useState(true)
  const [genState, setGenState]   = useState<GenState>('idle')
  const [copied, setCopied]       = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>('tiktok_copy')
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ai_episodes')
      .select('*')
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(50)
    setEpisodes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const loadSocial = useCallback(async (ep: AiEpisode) => {
    setSelected(ep)
    setSocial(null)
    setError('')
    const { data } = await supabase
      .from('nova_social_content')
      .select('*')
      .eq('episode_id', ep.id)
      .single()
    setSocial(data as NovaSocialContent | null)
  }, [])

  const runBrain = async () => {
    if (!selected) return
    setGenState('brain')
    setError('')
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: selected.id,
          script_id:  selected.script_id,
          show_name:  selected.show_name,
        }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.action_required || d.error || 'Generation failed')
      const { data } = await supabase.from('nova_social_content').select('*').eq('episode_id', selected.id).single()
      setSocial(data as NovaSocialContent | null)
      setEpisodes(prev => prev.map(ep => ep.id === selected.id
        ? { ...ep, social_content_id: d.social_content_id } : ep))
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  const runImage = async () => {
    if (!selected) return
    setGenState('image')
    setError('')
    try {
      const prompt = (social as unknown as Record<string, string>)?.thumbnail_prompt ||
        `Cinematic concept for ${selected.show_name.replace(/_/g, ' ')} episode. Dark dramatic background, gold accents.`
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: selected.id,
          show_name:  selected.show_name,
          prompt,
          asset_type: 'thumbnail',
        }),
      })
      const d = await r.json()
      if (d.skipped) {
        setError('FAL_API_KEY not configured. Add it to Supabase Edge Function Secrets.')
      } else if (!d.success) {
        throw new Error(d.error || 'Image generation failed')
      } else {
        const { data } = await supabase.from('nova_social_content').select('*').eq('episode_id', selected.id).single()
        setSocial(data as NovaSocialContent | null)
      }
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  const runCanva = async (designType = 'youtube_thumbnail') => {
    if (!selected) return
    setGenState('canva')
    setError('')
    try {
      const title = (social as unknown as Record<string,string>)?.episode_title || selected.episode_title || selected.heygen_title || 'Episode'
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-canva`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id:    selected.id,
          show_name:     selected.show_name,
          episode_title: title,
          design_type:   designType,
        }),
      })
      const d = await r.json()
      if (d.skipped || !d.success) {
        // Canva API not configured — open Canva manually
        window.open('https://www.canva.com/create/youtube-thumbnails/', '_blank')
        if (d.message) setError(d.message)
      } else {
        // Reload social content with new Canva URL
        const { data } = await supabase.from('nova_social_content').select('*').eq('episode_id', selected.id).single()
        setSocial(data as NovaSocialContent | null)
        if (d.edit_url) window.open(d.edit_url, '_blank')
      }
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const showLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const color = (ep: AiEpisode) => SHOW_COLORS[ep.show_name] ?? '#C9A84C'
  const sc = social as unknown as Record<string, string> | null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
            <Brain size={28} className="text-nova-violet" /> CONTENT STUDIO
          </h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            Claude AI + Socialblu + Ahrefs + Canva + fal.ai — all in CJ's voice
          </p>
        </div>
        <button onClick={load} className="nova-btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Episode selector */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">Select Episode</p>
          {loading ? (
            <div className="flex items-center gap-2 text-nova-muted text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          ) : episodes.length === 0 ? (
            <p className="text-sm text-nova-muted font-mono">No complete episodes yet.</p>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {episodes.map(ep => {
                const c = color(ep)
                const isSelected = selected?.id === ep.id
                const hasContent = Boolean(ep.social_content_id)
                return (
                  <button key={ep.id} onClick={() => loadSocial(ep)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-nova-violet/60 bg-nova-violet/10'
                        : 'border-nova-border hover:border-nova-border/80 hover:bg-nova-navydark/40'
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${c}18`, color: c }}>
                        {showLabel(ep.show_name)}
                      </span>
                      {hasContent && (
                        <span className="text-[10px] font-mono text-nova-teal flex items-center gap-1">
                          <Sparkles size={9} /> Ready
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-body text-white/80 line-clamp-2 mt-1">
                      {ep.episode_title || ep.heygen_title || 'Untitled episode'}
                    </p>
                    <p className="text-xs font-mono text-nova-muted mt-1">
                      {new Date(ep.created_at).toLocaleDateString()}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Content panel */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="nova-card flex flex-col items-center justify-center py-20 gap-4">
              <Brain size={40} className="text-nova-violet/40" />
              <p className="text-nova-muted font-mono text-sm">Select an episode to generate content</p>
            </div>
          ) : (
            <>
              {/* Episode header + actions */}
              <div className="nova-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${color(selected)}18`, color: color(selected) }}>
                        {showLabel(selected.show_name)}
                      </span>
                    </div>
                    <h2 className="font-display text-lg text-white">
                      {sc?.episode_title || selected.episode_title || selected.heygen_title || 'Untitled'}
                    </h2>
                    {sc?.hook && (
                      <p className="text-sm text-white/60 font-body mt-2 italic">"{sc.hook.slice(0, 120)}"</p>
                    )}
                  </div>
                  {(sc?.thumbnail_url || selected.thumbnail_url) && (
                    <img
                      src={sc?.thumbnail_url || selected.thumbnail_url}
                      alt="thumbnail"
                      className="w-24 h-16 rounded-lg object-cover border border-nova-border/40 flex-shrink-0"
                    />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <button onClick={runBrain} disabled={genState !== 'idle'}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-violet text-white text-sm font-body hover:bg-nova-violet/80 transition-all disabled:opacity-50">
                    {genState === 'brain'
                      ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
                      : <><Brain size={14} /> {sc ? 'Regen Content' : 'Generate Content'}</>}
                  </button>

                  <button onClick={runImage} disabled={genState !== 'idle'}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-nova-gold/40 text-nova-gold text-sm font-body hover:bg-nova-gold/10 transition-all disabled:opacity-50">
                    {genState === 'image'
                      ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
                      : <><Image size={14} /> AI Thumbnail</>}
                  </button>

                  <button onClick={() => runCanva('youtube_thumbnail')} disabled={genState !== 'idle'}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#7B2ABF]/40 text-[#A855F7] text-sm font-body hover:bg-[#7B2ABF]/10 transition-all disabled:opacity-50">
                    {genState === 'canva'
                      ? <><Loader2 size={14} className="animate-spin" /> Creating...</>
                      : <><Palette size={14} /> Canva Design</>}
                  </button>

                  {selected.storage_url && (
                    <a href={selected.storage_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-nova-border text-nova-muted text-sm font-body hover:text-white transition-all">
                      <Play size={14} /> Watch
                    </a>
                  )}
                </div>

                {/* Canva design link if available */}
                {sc?.canva_design_url && (
                  <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-[#7B2ABF]/10 border border-[#7B2ABF]/30">
                    <Palette size={13} className="text-[#A855F7]" />
                    <span className="text-xs font-mono text-[#A855F7]">Canva design ready</span>
                    <a href={sc.canva_design_url} target="_blank" rel="noreferrer"
                      className="ml-auto text-xs font-mono text-[#A855F7] hover:underline flex items-center gap-1">
                      Edit in Canva <ExternalLink size={10} />
                    </a>
                  </div>
                )}

                {error && (
                  <div className="mt-3 p-3 rounded-lg bg-nova-crimson/10 border border-nova-crimson/30 flex items-start gap-2">
                    <AlertCircle size={14} className="text-nova-crimson mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-mono text-nova-crimson">{error}</p>
                  </div>
                )}
              </div>

              {sc && sc.status === 'complete' ? (
                <>
                  {/* Hook + Caption */}
                  <div className="nova-card space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={14} className="text-nova-gold" />
                      <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Hook</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-body text-white leading-relaxed">{sc.hook}</p>
                      <button onClick={() => copy(sc.hook, 'hook')}
                        className="text-nova-muted hover:text-nova-gold p-1 flex-shrink-0">
                        {copied === 'hook' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div className="border-t border-nova-border pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={14} className="text-nova-teal" />
                        <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Caption</span>
                        <span className="text-[10px] font-mono text-nova-muted ml-auto">{sc.caption?.length || 0} chars</span>
                        <button onClick={() => copy(sc.caption, 'caption')}
                          className="text-nova-muted hover:text-nova-gold p-1">
                          {copied === 'caption' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-sm font-body text-white/80 leading-relaxed whitespace-pre-wrap">{sc.caption}</p>
                    </div>

                    {sc.hashtags && Array.isArray(JSON.parse('[]')) && (
                      <div className="border-t border-nova-border pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Hash size={14} className="text-nova-violet" />
                          <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Hashtags</span>
                          <button onClick={() => copy((social?.hashtags || []).join(' '), 'hashtags')}
                            className="ml-auto text-nova-muted hover:text-nova-gold p-1">
                            {copied === 'hashtags' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(social?.hashtags || []).map((h: string, i: number) => (
                            <span key={i} className="text-xs font-mono px-2 py-0.5 rounded-full bg-nova-violet/10 text-nova-violet">
                              {h.startsWith('#') ? h : `#${h}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {sc.cta && (
                      <div className="border-t border-nova-border pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={14} className="text-nova-gold" />
                            <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">CTA</span>
                          </div>
                          <button onClick={() => copy(sc.cta, 'cta')}
                            className="text-nova-muted hover:text-nova-gold p-1">
                            {copied === 'cta' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                          </button>
                        </div>
                        <p className="text-sm font-body text-nova-gold mt-2">{sc.cta}</p>
                      </div>
                    )}
                  </div>

                  {/* Platform copy */}
                  <div className="nova-card">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={14} className="text-nova-teal" />
                      <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Platform Copy</span>
                    </div>
                    <div className="space-y-2">
                      {PLATFORMS.map(({ key, label, icon, limit }) => {
                        const text = sc?.[key] || ''
                        if (!text) return null
                        const isExpanded = expanded === key
                        return (
                          <div key={key} className="border border-nova-border/50 rounded-xl overflow-hidden">
                            <button onClick={() => setExpanded(isExpanded ? null : key)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-nova-navydark/40 transition-all">
                              <div className="flex items-center gap-2">
                                <span>{icon}</span>
                                <span className="text-sm font-body text-white">{label}</span>
                                <span className="text-[10px] font-mono text-nova-muted">{text.length}/{limit}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={e => { e.stopPropagation(); copy(text, key) }}
                                  className="text-nova-muted hover:text-nova-gold p-1">
                                  {copied === key ? <Check size={12} className="text-nova-teal" /> : <Copy size={12} />}
                                </button>
                                {isExpanded
                                  ? <ChevronUp size={14} className="text-nova-muted" />
                                  : <ChevronDown size={14} className="text-nova-muted" />}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 bg-nova-navydark/20">
                                <p className="text-sm font-body text-white/80 whitespace-pre-wrap leading-relaxed">{text}</p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Assets */}
                  {(sc?.thumbnail_url || sc?.canva_design_url || sc?.social_card_url) && (
                    <div className="nova-card">
                      <div className="flex items-center gap-2 mb-4">
                        <Image size={14} className="text-nova-gold" />
                        <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Generated Assets</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {sc?.thumbnail_url && (
                          <div>
                            <a href={sc.thumbnail_url} target="_blank" rel="noreferrer">
                              <img src={sc.thumbnail_url} alt="AI thumbnail"
                                className="w-full rounded-lg object-cover border border-nova-border/40 hover:border-nova-gold/40 transition-all" />
                            </a>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs font-mono text-nova-muted">fal.ai Thumbnail</p>
                              <a href={sc.thumbnail_url} download
                                className="ml-auto text-nova-muted hover:text-nova-gold">
                                <Download size={11} />
                              </a>
                            </div>
                          </div>
                        )}
                        {sc?.canva_design_url && (
                          <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-[#7B2ABF]/30 bg-[#7B2ABF]/10 gap-2">
                            <Palette size={24} className="text-[#A855F7]" />
                            <p className="text-xs font-mono text-[#A855F7] text-center">Canva Design</p>
                            <a href={sc.canva_design_url} target="_blank" rel="noreferrer"
                              className="text-xs font-mono text-white bg-[#7B2ABF] px-3 py-1.5 rounded-lg hover:bg-[#6B1FAF] transition-all flex items-center gap-1">
                              Edit in Canva <ExternalLink size={10} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : !sc ? (
                <div className="nova-card flex flex-col items-center py-12 gap-4">
                  <Brain size={32} className="text-nova-violet/40" />
                  <p className="text-sm font-mono text-nova-muted text-center">
                    No content yet.<br/>Click <strong className="text-nova-violet">Generate Content</strong> to create AI copy in CJ's voice.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
