import { useEffect, useState, useCallback } from 'react'
import { Brain, Sparkles, Image, Copy, Check, RefreshCw, Loader2, Hash, 
         Zap, TrendingUp, Youtube, Linkedin, Twitter, ChevronDown, ChevronUp,
         AlertCircle, Play, FileText } from 'lucide-react'
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
  { key: 'tiktok_copy',          label: 'TikTok',     icon: '🎵', limit: 150 },
  { key: 'instagram_copy',       label: 'Instagram',  icon: '📸', limit: 2200 },
  { key: 'youtube_description',  label: 'YouTube',    icon: '▶️', limit: 5000 },
  { key: 'linkedin_copy',        label: 'LinkedIn',   icon: '💼', limit: 3000 },
  { key: 'twitter_copy',         label: 'Twitter/X',  icon: '🐦', limit: 280 },
  { key: 'pinterest_copy',       label: 'Pinterest',  icon: '📌', limit: 500 },
]

export default function Studio() {
  const [episodes, setEpisodes] = useState<AiEpisode[]>([])
  const [selected, setSelected] = useState<AiEpisode | null>(null)
  const [social, setSocial]     = useState<NovaSocialContent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genImage, setGenImage] = useState(false)
  const [copied, setCopied]     = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>('tiktok_copy')
  const [error, setError]       = useState('')

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
    if (ep.social_content_id) {
      const { data } = await supabase
        .from('nova_social_content')
        .select('*')
        .eq('episode_id', ep.id)
        .single()
      setSocial(data as NovaSocialContent | null)
    }
  }, [])

  const generate = async () => {
    if (!selected) return
    setGenerating(true)
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
      if (!d.success) throw new Error(d.error || d.action_required || 'Generation failed')
      // Reload social content
      const { data } = await supabase.from('nova_social_content').select('*').eq('episode_id', selected.id).single()
      setSocial(data as NovaSocialContent | null)
      // Update local episode list
      setEpisodes(prev => prev.map(ep => ep.id === selected.id
        ? { ...ep, social_content_id: d.social_content_id } : ep))
    } catch (e) {
      setError(String(e))
    }
    setGenerating(false)
  }

  const generateThumbnail = async () => {
    if (!selected) return
    setGenImage(true)
    setError('')
    try {
      const prompt = social?.thumbnail_prompt ||
        `Powerful cinematic concept for a ${selected.show_name.replace(/_/g,' ')} episode. Dark dramatic background, gold accents.`
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nova-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: selected.id, show_name: selected.show_name, prompt, asset_type: 'thumbnail' }),
      })
      const d = await r.json()
      if (d.skipped) {
        setError('Image generation requires FAL_API_KEY. Get a free key at fal.ai and add it to Supabase Edge Function secrets.')
      } else if (!d.success) {
        throw new Error(d.error || 'Image generation failed')
      } else {
        // Reload
        const { data } = await supabase.from('nova_social_content').select('*').eq('episode_id', selected.id).single()
        setSocial(data as NovaSocialContent | null)
      }
    } catch (e) {
      setError(String(e))
    }
    setGenImage(false)
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const showLabel = (s: string) => s.replace(/_/g, ' ').replace(/\w/g, c => c.toUpperCase())
  const color = (ep: AiEpisode) => SHOW_COLORS[ep.show_name] ?? '#C9A84C'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
            <Brain size={28} className="text-nova-violet" /> CONTENT STUDIO
          </h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            AI-powered content generation · CJ's voice · all 6 platforms
          </p>
        </div>
        <button onClick={load} className="nova-btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Episode selector */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-xs font-mono text-nova-muted uppercase tracking-widest">
            Select Episode
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-nova-muted text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading episodes…
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
              {/* Episode header */}
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
                      {social?.episode_title || selected.episode_title || selected.heygen_title || 'Untitled'}
                    </h2>
                    {social?.hook && (
                      <p className="text-sm text-white/70 font-body mt-2 italic">"{social.hook}"</p>
                    )}
                  </div>
                  {(selected.thumbnail_url || social?.thumbnail_url) && (
                    <img src={social?.thumbnail_url || selected.thumbnail_url} alt="thumbnail"
                      className="w-20 h-20 rounded-lg object-cover border border-nova-border/40 flex-shrink-0" />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <button onClick={generate} disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-violet text-white text-sm font-body
                               hover:bg-nova-violet/80 transition-all disabled:opacity-50">
                    {generating
                      ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                      : <><Brain size={14} /> {social ? 'Regenerate Content' : 'Generate Content'}</>}
                  </button>
                  <button onClick={generateThumbnail} disabled={genImage}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-nova-gold/40 text-nova-gold text-sm font-body
                               hover:bg-nova-gold/10 transition-all disabled:opacity-50">
                    {genImage
                      ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                      : <><Image size={14} /> {social?.thumbnail_url ? 'New Thumbnail' : 'Generate Thumbnail'}</>}
                  </button>
                  {selected.storage_url && (
                    <a href={selected.storage_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-nova-border text-nova-muted text-sm font-body hover:text-white transition-all">
                      <Play size={14} /> Watch Episode
                    </a>
                  )}
                </div>

                {error && (
                  <div className="mt-3 p-3 rounded-lg bg-nova-crimson/10 border border-nova-crimson/30 flex items-start gap-2">
                    <AlertCircle size={14} className="text-nova-crimson mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-mono text-nova-crimson">{error}</p>
                  </div>
                )}
              </div>

              {social && social.status === 'complete' ? (
                <>
                  {/* Hook + Caption */}
                  <div className="nova-card space-y-4">
                    <div className="flex items-center gap-2 mb-3">
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
                        <span className="text-[10px] font-mono text-nova-muted ml-auto">{social.caption.length} chars</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-body text-white/80 leading-relaxed whitespace-pre-wrap">{social.caption}</p>
                        <button onClick={() => copy(social.caption, 'caption')}
                          className="text-nova-muted hover:text-nova-gold p-1 flex-shrink-0">
                          {copied === 'caption' ? <Check size={13} className="text-nova-teal" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    {/* Hashtags */}
                    {social.hashtags?.length > 0 && (
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
                            <span key={i} className="text-xs font-mono px-2 py-0.5 rounded-full bg-nova-violet/10 text-nova-violet">
                              {h.startsWith('#') ? h : `#${h}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    {social.cta && (
                      <div className="border-t border-nova-border pt-4">
                        <div className="flex items-center justify-between gap-2">
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
                  </div>

                  {/* Platform-specific copy */}
                  <div className="nova-card">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={14} className="text-nova-teal" />
                      <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Platform Copy</span>
                    </div>
                    <div className="space-y-2">
                      {PLATFORMS.map(({ key, label, icon, limit }) => {
                        const text = (social as unknown as Record<string, string>)[key] || ''
                        if (!text) return null
                        const isExpanded = expanded === key
                        return (
                          <div key={key} className="border border-nova-border/50 rounded-xl overflow-hidden">
                            <button
                              onClick={() => setExpanded(isExpanded ? null : key)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-nova-navydark/40 transition-all"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">{icon}</span>
                                <span className="text-sm font-body text-white">{label}</span>
                                <span className="text-[10px] font-mono text-nova-muted">{text.length}/{limit}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); copy(text, key) }}
                                  className="text-nova-muted hover:text-nova-gold p-1">
                                  {copied === key ? <Check size={12} className="text-nova-teal" /> : <Copy size={12} />}
                                </button>
                                {isExpanded ? <ChevronUp size={14} className="text-nova-muted" /> : <ChevronDown size={14} className="text-nova-muted" />}
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

                  {/* Thumbnail */}
                  {(social.thumbnail_url || social.social_card_url) && (
                    <div className="nova-card">
                      <div className="flex items-center gap-2 mb-4">
                        <Image size={14} className="text-nova-gold" />
                        <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">AI Generated Assets</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {social.thumbnail_url && (
                          <a href={social.thumbnail_url} target="_blank" rel="noreferrer">
                            <img src={social.thumbnail_url} alt="thumbnail"
                              className="w-full rounded-lg object-cover border border-nova-border/40 hover:border-nova-gold/40 transition-all" />
                            <p className="text-xs font-mono text-nova-muted mt-1 text-center">Thumbnail</p>
                          </a>
                        )}
                        {social.social_card_url && (
                          <a href={social.social_card_url} target="_blank" rel="noreferrer">
                            <img src={social.social_card_url} alt="social card"
                              className="w-full rounded-lg object-cover border border-nova-border/40 hover:border-nova-gold/40 transition-all" />
                            <p className="text-xs font-mono text-nova-muted mt-1 text-center">Social Card</p>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : social?.status === 'failed' ? (
                <div className="nova-card flex items-center gap-3">
                  <AlertCircle size={16} className="text-nova-crimson" />
                  <p className="text-sm font-mono text-nova-crimson">{social.error_msg || 'Content generation failed'}</p>
                </div>
              ) : !social ? (
                <div className="nova-card flex flex-col items-center py-12 gap-4">
                  <Brain size={32} className="text-nova-violet/40" />
                  <p className="text-sm font-mono text-nova-muted text-center">
                    No content generated yet.<br/>Click <strong className="text-nova-violet">Generate Content</strong> to create AI-powered social copy in CJ's voice.
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
