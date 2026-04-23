import GuestGate from '../components/GuestGate'
import { useEffect, useState, useCallback } from 'react'
import {
  Brain, Sparkles, Copy, Check, RefreshCw, Loader2, Hash, Zap,
  TrendingUp, ChevronDown, ChevronUp, AlertCircle, Play, FileText,
  ExternalLink, Palette, Download, Layers, Search, ArrowRight
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
  { key: 'tiktok_copy',          label: 'TikTok',     icon: 'T', limit: 150  },
  { key: 'instagram_copy',       label: 'Instagram',  icon: 'I', limit: 2200 },
  { key: 'youtube_description',  label: 'YouTube',    icon: 'Y', limit: 5000 },
  { key: 'linkedin_copy',        label: 'LinkedIn',   icon: 'L', limit: 3000 },
  { key: 'twitter_copy',         label: 'Twitter/X',  icon: 'X', limit: 280  },
  { key: 'pinterest_copy',       label: 'Pinterest',  icon: 'P', limit: 500  },
  { key: 'reddit_copy',          label: 'Reddit',     icon: 'R', limit: 10000 },
]

type GenState = 'idle' | 'brain' | 'image' | 'canva' | 'all'

export default function Studio() {
  const [episodes, setEpisodes]   = useState<AiEpisode[]>([])
  const [selected, setSelected]   = useState<AiEpisode | null>(null)
  const [social, setSocial]       = useState<NovaSocialContent | null>(null)
  const [loading, setLoading]     = useState(true)
  const [genState, setGenState]   = useState<GenState>('idle')
  const [copied, setCopied]       = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>('tiktok_copy')
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')

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

  const reloadSocial = async (epId: string) => {
    const { data } = await supabase.from('nova_social_content').select('*').eq('episode_id', epId).single()
    setSocial(data as NovaSocialContent | null)
  }

  const runBrain = async () => {
    if (!selected) return
    setGenState('brain'); setError('')
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-brain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: selected.id, script_id: selected.script_id, show_name: selected.show_name }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.action_required || d.error || 'Generation failed')
      await reloadSocial(selected.id)
      setEpisodes(prev => prev.map(ep => ep.id === selected.id ? { ...ep, social_content_id: d.social_content_id } : ep))
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  const runImage = async () => {
    if (!selected) return
    setGenState('image'); setError('')
    try {
      const prompt = social?.thumbnail_prompt ||
        `Cinematic visual concept for ${selected.show_name.replace(/_/g, ' ')} podcast. Dark atmosphere, emotional, powerful.`
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: selected.id, show_name: selected.show_name,
          prompt, asset_type: 'thumbnail',
          episode_title: social?.episode_title || selected.episode_title || '',
        }),
      })
      const d = await r.json()
      if (d.skipped) setError('FAL_API_KEY not set in Supabase Edge Function Secrets.')
      else if (!d.success) throw new Error(d.error || 'Image generation failed')
      else {
        await reloadSocial(selected.id)
        if (d.composite) setError('') // success with Canva composite
      }
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  const runCanva = async () => {
    if (!selected) return
    setGenState('canva'); setError('')
    try {
      const title = social?.episode_title || selected.episode_title || selected.heygen_title || 'Episode'
      // If we have a fal.ai image, pass it as background for the Canva design
      const background_url = social?.thumbnail_url || social?.fal_raw_url || ''
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-canva`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: selected.id, show_name: selected.show_name,
          episode_title: title, design_type: 'youtube_thumbnail',
          background_url,
        }),
      })
      const d = await r.json()
      if (d.skipped || !d.success) {
        // Open Canva with instructions to use fal.ai image as background
        const canvaUrl = background_url
          ? `https://www.canva.com/design/new?template=youtube_thumbnail`
          : 'https://www.canva.com/create/youtube-thumbnails/'
        window.open(canvaUrl, '_blank')
        if (d.message) setError(d.message + ' Opening Canva manually.')
      } else {
        await reloadSocial(selected.id)
        if (d.edit_url) window.open(d.edit_url, '_blank')
      }
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  // Generate everything: brain + image (fal.ai + canva) in sequence
  const runAll = async () => {
    if (!selected) return
    setGenState('all'); setError('')
    try {
      // 1. Brain (AI content)
      const brainR = await fetch(`${SUPABASE_URL}/functions/v1/nova-brain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: selected.id, script_id: selected.script_id, show_name: selected.show_name }),
      })
      const brainD = await brainR.json()
      if (!brainD.success && !brainD.social_content_id) throw new Error(brainD.error || 'Brain failed')
      // 2. Image (fal.ai + Canva composite)
      const imgPrompt = brainD.content?.thumbnail_prompt ||
        `Cinematic concept for ${selected.show_name.replace(/_/g, ' ')}. Dark dramatic.`
      const imgR = await fetch(`${SUPABASE_URL}/functions/v1/nova-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: selected.id, show_name: selected.show_name,
          prompt: imgPrompt, asset_type: 'thumbnail',
          episode_title: brainD.content?.episode_title || '',
        }),
      })
      const imgD = await imgR.json()
      if (imgD.skipped) setError('Add FAL_API_KEY to Supabase to enable AI thumbnails.')
      await reloadSocial(selected.id)
      setEpisodes(prev => prev.map(ep => ep.id === selected.id ? { ...ep, social_content_id: brainD.social_content_id } : ep))
    } catch (e) { setError(String(e)) }
    setGenState('idle')
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const showLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const epColor = (ep: AiEpisode) => SHOW_COLORS[ep.show_name] ?? '#C9A84C'

  const filteredEps = search
    ? episodes.filter(ep =>
        (ep.episode_title + ep.heygen_title + ep.show_name).toLowerCase().includes(search.toLowerCase()))
    : episodes

  const busy = genState !== 'idle'

  return (
    <GuestGate pageName="Content Studio">
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
            <Brain size={28} className="text-nova-violet" /> CONTENT STUDIO
          </h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            Claude + Socialblu + Ahrefs + fal.ai + Canva — all in CJ's voice
          </p>
        </div>
        <button onClick={load} className="nova-btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Episode selector */}
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-nova-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="nova-input pl-8 text-xs"
              placeholder="Search episodes..." />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-nova-muted text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          ) : filteredEps.length === 0 ? (
            <p className="text-sm text-nova-muted font-mono">No episodes found.</p>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {filteredEps.map(ep => {
                const c = epColor(ep)
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
              <p className="text-nova-muted font-mono text-sm text-center">
                Select an episode to generate content
              </p>
            </div>
          ) : (
            <>
              {/* Header + actions */}
              <div className="nova-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${epColor(selected)}18`, color: epColor(selected) }}>
                        {showLabel(selected.show_name)}
                      </span>
                    </div>
                    <h2 className="font-display text-xl text-white">
                      {social?.episode_title || selected.episode_title || selected.heygen_title || 'Untitled'}
                    </h2>
                    {social?.hook && (
                      <p className="text-sm text-white/60 font-body mt-2 italic">
                        "{social.hook.slice(0, 130)}..."
                      </p>
                    )}
                    {social?.hook_alternate && social.hook_alternate !== social.hook && (
                      <p className="text-xs text-nova-muted font-mono mt-1">
                        Alt hook: {social.hook_alternate.slice(0, 80)}
                      </p>
                    )}
                  </div>
                  {(social?.thumbnail_url || selected.thumbnail_url) && (
                    <img
                      src={social?.thumbnail_url || selected.thumbnail_url}
                      alt="thumbnail"
                      className="w-24 h-16 rounded-lg object-cover border border-nova-border/40 flex-shrink-0"
                    />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  {/* Generate Everything */}
                  <button onClick={runAll} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #9B5DE5, #2A9D8F)', color: 'white' }}>
                    {genState === 'all'
                      ? <><Loader2 size={14} className="animate-spin" /> Generating All...</>
                      : <><Layers size={14} /> Generate All</>}
                  </button>

                  {/* AI Content only */}
                  <button onClick={runBrain} disabled={busy}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-nova-violet/40 text-nova-violet text-sm font-body hover:bg-nova-violet/10 transition-all disabled:opacity-50">
                    {genState === 'brain'
                      ? <><Loader2 size={13} className="animate-spin" /> Writing...</>
                      : <><Brain size={13} /> AI Copy</>}
                  </button>

                  {/* fal.ai + Canva */}
                  <button onClick={runImage} disabled={busy}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-nova-gold/40 text-nova-gold text-sm font-body hover:bg-nova-gold/10 transition-all disabled:opacity-50">
                    {genState === 'image'
                      ? <><Loader2 size={13} className="animate-spin" /> Generating...</>
                      : <><span className="text-xs">fal.ai</span> Thumbnail</>}
                  </button>

                  {/* Canva Design */}
                  <button onClick={runCanva} disabled={busy}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-body hover:opacity-80 transition-all disabled:opacity-50"
                    style={{ borderColor: '#A855F740', color: '#A855F7' }}>
                    {genState === 'canva'
                      ? <><Loader2 size={13} className="animate-spin" /> Creating...</>
                      : <><Palette size={13} /> Canva</>}
                  </button>

                  {selected.storage_url && (
                    <a href={selected.storage_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-nova-border text-nova-muted text-sm font-body hover:text-white transition-all">
                      <Play size={13} /> Watch
                    </a>
                  )}
                </div>

                {/* Canva link */}
                {social?.canva_design_url && (
                  <div className="mt-3 flex items-center gap-2 p-2 rounded-lg border"
                    style={{ borderColor: '#A855F730', backgroundColor: '#A855F710' }}>
                    <Palette size={13} style={{ color: '#A855F7' }} />
                    <span className="text-xs font-mono" style={{ color: '#A855F7' }}>Canva design ready</span>
                    {social.fal_raw_url && (
                      <span className="text-[10px] font-mono text-nova-muted ml-1">fal.ai + Canva composite</span>
                    )}
                    <a href={social.canva_design_url} target="_blank" rel="noreferrer"
                      className="ml-auto text-xs font-mono hover:underline flex items-center gap-1"
                      style={{ color: '#A855F7' }}>
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

              {social?.status === 'complete' ? (
                <>
                  {/* Hook + Caption */}
                  <div className="nova-card space-y-4">
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-nova-gold" />
                      <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Hook</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-body text-white leading-relaxed">{social.hook}</p>
                      <button onClick={() => copy(social.hook, 'hook')}
                        className="text-nova-muted hover:text-nova-gold p-1 flex-shrink-0">
                        {copied === 'hook' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div className="border-t border-nova-border pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={14} className="text-nova-teal" />
                        <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Caption</span>
                        <span className="text-[10px] font-mono text-nova-muted ml-auto">{social.caption?.length || 0} chars</span>
                        <button onClick={() => copy(social.caption, 'caption')}
                          className="text-nova-muted hover:text-nova-gold p-1">
                          {copied === 'caption' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-sm font-body text-white/80 leading-relaxed whitespace-pre-wrap">{social.caption}</p>
                    </div>

                    {social.hashtags && social.hashtags.length > 0 && (
                      <div className="border-t border-nova-border pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Hash size={14} className="text-nova-violet" />
                          <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Hashtags</span>
                          <button onClick={() => copy(social.hashtags.join(' '), 'hashtags')}
                            className="ml-auto text-nova-muted hover:text-nova-gold p-1">
                            {copied === 'hashtags' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {social.hashtags.map((h, i) => (
                            <span key={i}
                              className="text-xs font-mono px-2 py-0.5 rounded-full bg-nova-violet/10 text-nova-violet">
                              {h.startsWith('#') ? h : `#${h}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {social.cta && (
                      <div className="border-t border-nova-border pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={14} className="text-nova-gold" />
                            <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">CTA</span>
                          </div>
                          <button onClick={() => copy(social.cta, 'cta')}
                            className="text-nova-muted hover:text-nova-gold p-1">
                            {copied === 'cta' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                          </button>
                        </div>
                        <p className="text-sm font-body text-nova-gold mt-2">{social.cta}</p>
                      </div>
                    )}

                    {social.seo_keywords && social.seo_keywords.length > 0 && (
                      <div className="border-t border-nova-border pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Search size={13} className="text-nova-muted" />
                          <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">SEO Keywords</span>
                          <button onClick={() => copy(social.seo_keywords.join(', '), 'seo')}
                            className="ml-auto text-nova-muted hover:text-nova-gold p-1">
                            {copied === 'seo' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {social.seo_keywords.map((kw, i) => (
                            <span key={i} className="text-xs font-mono px-2 py-0.5 rounded-full bg-nova-teal/10 text-nova-teal">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Platform copy */}
                  <div className="nova-card">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={14} className="text-nova-teal" />
                      <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Platform Copy</span>
                      <span className="text-[10px] font-mono text-nova-muted ml-auto">7 platforms</span>
                    </div>
                    <div className="space-y-2">
                      {PLATFORMS.map(({ key, label, icon, limit }) => {
                        const text = (social as unknown as Record<string, string>)[key] || ''
                        if (!text) return null
                        const isExpanded = expanded === key
                        return (
                          <div key={key} className="border border-nova-border/50 rounded-xl overflow-hidden">
                            <button onClick={() => setExpanded(isExpanded ? null : key)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-nova-navydark/40 transition-all">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-nova-muted w-4">{icon}</span>
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

                  {/* Assets: fal.ai + Canva side by side */}
                  {(social.thumbnail_url || social.canva_design_url || social.social_card_url) && (
                    <div className="nova-card">
                      <div className="flex items-center gap-2 mb-4">
                        <Layers size={14} className="text-nova-gold" />
                        <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">
                          Generated Assets {social.canva_design_url && social.fal_raw_url ? '— fal.ai + Canva Composite' : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {social.thumbnail_url && (
                          <div>
                            <a href={social.thumbnail_url} target="_blank" rel="noreferrer">
                              <img src={social.thumbnail_url} alt="AI thumbnail"
                                className="w-full rounded-lg object-cover border border-nova-border/40 hover:border-nova-gold/40 transition-all" />
                            </a>
                            <div className="flex items-center gap-2 mt-1.5">
                              <p className="text-xs font-mono text-nova-muted">fal.ai Raw</p>
                              <a href={social.thumbnail_url} download className="ml-auto text-nova-muted hover:text-nova-gold">
                                <Download size={11} />
                              </a>
                            </div>
                          </div>
                        )}
                        {social.canva_design_url ? (
                          <div className="flex flex-col items-center justify-center p-4 rounded-lg border gap-2"
                            style={{ borderColor: '#A855F730', backgroundColor: '#A855F710' }}>
                            <Palette size={24} style={{ color: '#A855F7' }} />
                            <div className="text-center">
                              <p className="text-xs font-mono" style={{ color: '#A855F7' }}>Canva Design</p>
                              {social.fal_raw_url && (
                                <p className="text-[10px] font-mono text-nova-muted mt-0.5">fal.ai background</p>
                              )}
                            </div>
                            <a href={social.canva_design_url} target="_blank" rel="noreferrer"
                              className="text-xs font-mono text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all"
                              style={{ backgroundColor: '#7B2ABF' }}>
                              Edit in Canva <ExternalLink size={10} />
                            </a>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-nova-border/30 gap-2">
                            <Palette size={20} className="text-nova-muted/40" />
                            <p className="text-xs font-mono text-nova-muted text-center">No Canva design yet</p>
                            <button onClick={runCanva} disabled={busy}
                              className="text-xs font-mono px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-all disabled:opacity-40"
                              style={{ borderColor: '#A855F740', color: '#A855F7' }}>
                              <ArrowRight size={10} /> Create Canva Design
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : !social ? (
                <div className="nova-card flex flex-col items-center py-12 gap-4">
                  <Brain size={32} className="text-nova-violet/40" />
                  <div className="text-center">
                    <p className="text-sm font-mono text-nova-muted">No content generated yet.</p>
                    <p className="text-xs font-mono text-nova-muted mt-1">
                      Click <strong className="text-nova-violet">Generate All</strong> for AI copy + fal.ai thumbnail + Canva design.
                    </p>
                  </div>
                  <button onClick={runAll} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body disabled:opacity-50 transition-all"
                    style={{ background: 'linear-gradient(135deg, #9B5DE5, #2A9D8F)', color: 'white' }}>
                    {busy ? <><Loader2 size={14} className="animate-spin" /> Working...</> : <><Layers size={14} /> Generate All</>}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
    </GuestGate>
  )
}