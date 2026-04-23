import { useState, useRef, useEffect } from 'react'
import { Wand2, Sparkles, X, Loader2, Check, Tv2, Megaphone } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ShowConfig { id: string; show_name: string; display_name: string; color: string }

const PLATFORMS = [
  { id: 'youtube',   label: 'YouTube',   emoji: '▶️' },
  { id: 'linkedin',  label: 'LinkedIn',  emoji: '💼' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'tiktok',    label: 'TikTok',    emoji: '🎵' },
  { id: 'x',         label: 'X',         emoji: '𝕏'  },
  { id: 'pinterest', label: 'Pinterest', emoji: '📌' },
  { id: 'reddit',    label: 'Reddit',    emoji: '🤖' },
] as const
type PlatformId = typeof PLATFORMS[number]['id']
type ContentType = 'episode' | 'commercial'

// Silent show picker — NOVA decides, user never sees this
function pickShow(idea: string, shows: ShowConfig[]): ShowConfig | null {
  const lower = idea.toLowerCase()
  const map: [string[], string][] = [
    [['confess','trial','court','guilty','verdict','toxic','trauma','lie','lying','justify','excuse','blame'], 'confession_court'],
    [['motivat','discipline','execute','action','accountability','commit','goal','grind','hustle','focus','lazy','procrastin'], 'motivation_court'],
    [['sunday','week','power','reset','intention','plan','prep','monday','ritual','morning','routine'], 'sunday_power_hour'],
    [['relationship','boundary','love','partner','friend','family','communicate','tea','sip','trust','loyal','alone'], 'tea_time_with_cj'],
  ]
  for (const [kws, name] of map) {
    if (kws.some(k => lower.includes(k))) return shows.find(s => s.show_name === name) ?? null
  }
  return shows.find(s => s.show_name === 'tea_time_with_cj') ?? shows[0] ?? null
}

interface Props { onClose: () => void; onCreated: () => void }

export default function NovaIdeaModal({ onClose, onCreated }: Props) {
  const [idea, setIdea]             = useState('')
  const [platform, setPlatform]     = useState<PlatformId>('youtube')
  const [contentType, setContentType] = useState<ContentType>('episode')
  const [shows, setShows]           = useState<ShowConfig[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.from('show_configs').select('id,show_name,display_name,color')
      .then(({ data }) => setShows((data ?? []) as ShowConfig[]))
    textRef.current?.focus()
  }, [])

  const submit = async () => {
    if (!idea.trim()) { setError('Enter an idea first'); return }
    setSubmitting(true); setError('')
    try {
      // NOVA silently picks the show for episodes; commercials use first show as anchor
      const pickedShow = contentType === 'episode'
        ? pickShow(idea, shows)
        : (shows[0] ?? null)

      if (!pickedShow) { setError('No show configured'); setSubmitting(false); return }

      const { error: insertErr } = await supabase.from('show_scripts').insert({
        show_id:              pickedShow.id,
        part_title:           idea.trim(),
        series_topic:         contentType === 'commercial' ? 'CHA Commercial' : idea.trim(),
        series_part:          null,
        script_text:          '',
        caption:              '',
        status:               'scripting',
        platform,
        content_type:         contentType,
        scripting_started_at: new Date().toISOString(),
      })
      if (insertErr) throw insertErr
      setDone(true)
      setTimeout(() => { onCreated(); onClose() }, 1400)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSubmitting(false)
  }

  const isCommercial = contentType === 'commercial'
  const btnLabel = isCommercial ? 'Generate Commercial' : 'Generate Episode'
  const subLabel = isCommercial
    ? 'NOVA writes a 30–60 sec ad script with hook, pitch & CTA'
    : 'NOVA writes the full 30-min episode script'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-nova-navydark border border-nova-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-nova-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-nova-gold/10 border border-nova-gold/20 flex items-center justify-center">
              <Sparkles size={15} className="text-nova-gold" />
            </div>
            <div>
              <p className="text-sm font-body font-semibold text-white">NOVA Idea Generator</p>
              <p className="text-[10px] font-mono text-nova-muted">Give NOVA an idea → full script</p>
            </div>
          </div>
          <button onClick={onClose} className="nova-btn-ghost p-1.5"><X size={15}/></button>
        </div>

        <div className="p-5 space-y-4">

          {/* Content type toggle */}
          <div>
            <label className="text-[10px] font-mono text-nova-muted uppercase tracking-widest block mb-2">
              What are you creating?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { type: 'episode'    as ContentType, icon: <Tv2 size={14}/>,       label: 'Episode',    sub: '30-min show script' },
                { type: 'commercial' as ContentType, icon: <Megaphone size={14}/>, label: 'Commercial', sub: '30–60 sec ad' },
              ] as const).map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setContentType(opt.type)}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition-all ${
                    contentType === opt.type
                      ? 'border-nova-gold/40 bg-nova-gold/10'
                      : 'border-nova-border/40 hover:border-nova-border'
                  }`}
                >
                  <span className={contentType === opt.type ? 'text-nova-gold' : 'text-nova-muted'}>
                    {opt.icon}
                  </span>
                  <div>
                    <p className={`text-xs font-body font-semibold ${contentType === opt.type ? 'text-white' : 'text-nova-muted'}`}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] font-mono text-nova-muted">{opt.sub}</p>
                  </div>
                  {contentType === opt.type && (
                    <Check size={12} className="ml-auto text-nova-gold flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Idea input */}
          <div>
            <label className="text-[10px] font-mono text-nova-muted uppercase tracking-widest block mb-1.5">
              {isCommercial ? 'Product / Concept to Promote' : 'Your Idea / Topic'}
            </label>
            <textarea
              ref={textRef}
              value={idea}
              onChange={e => setIdea(e.target.value)}
              placeholder={isCommercial
                ? 'e.g. BrandPulse — AI brand audit that gives you a 12-page report...'
                : 'e.g. People who stay in relationships out of fear instead of love...'}
              rows={3}
              className="w-full bg-nova-surface border border-nova-border rounded-lg px-3 py-2.5 text-sm font-body text-white placeholder-nova-muted focus:outline-none focus:border-nova-gold/40 resize-none"
            />
            {!isCommercial && (
              <p className="text-[10px] font-mono text-nova-muted mt-1">
                NOVA automatically selects the best show for your idea
              </p>
            )}
          </div>

          {/* Platform */}
          <div>
            <label className="text-[10px] font-mono text-nova-muted uppercase tracking-widest block mb-1.5">
              Platform
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-mono transition-all ${
                    platform === p.id
                      ? 'border-nova-gold/40 bg-nova-gold/10 text-nova-gold'
                      : 'border-nova-border/40 text-nova-muted hover:text-white'
                  }`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={submitting || done || !idea.trim()}
            className="w-full py-3 rounded-xl text-sm font-body font-semibold text-nova-navy transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: done ? '#2A9D8F' : 'linear-gradient(135deg, #C9A84C, #9B5DE5)' }}
          >
            {done
              ? <><Check size={15}/> Queued — NOVA is writing it</>
              : submitting
              ? <><Loader2 size={15} className="animate-spin"/> Queuing...</>
              : <><Wand2 size={15}/> {btnLabel}</>
            }
          </button>
          <p className="text-[10px] font-mono text-nova-muted text-center">{subLabel} • Check Scripts tab for status</p>
        </div>
      </div>
    </div>
  )
}
