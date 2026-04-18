import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle, Zap, ImageIcon, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ShowConfig } from '../types'

const SHOW_COLORS: Record<string, string> = {
  sunday_power_hour:  '#C9A84C',
  motivation_court:   '#2A9D8F',
  tea_time_with_cj:   '#9B5DE5',
  confession_court:   '#C1121F',
}

export default function Settings() {
  const [shows, setShows]   = useState<ShowConfig[]>([])
  const [edits, setEdits]   = useState<Record<string, {
    voice_id: string; avatar_id: string; heygen_voice_id: string;
    description: string; background_url: string
  }>>({})
  const [saving, setSaving]     = useState<string | null>(null)
  const [saved, setSaved]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({})

  useEffect(() => {
    supabase.from('show_configs').select('*').order('display_name').then(({ data }) => {
      const s = data ?? []
      setShows(s)
      const init: typeof edits = {}
      for (const show of s) {
        init[show.id] = {
          voice_id:        show.voice_id,
          avatar_id:       show.avatar_id,
          heygen_voice_id: show.heygen_voice_id ?? '',
          description:     show.description,
          background_url:  show.background_url ?? '',
        }
      }
      setEdits(init)
      setLoading(false)
    })
  }, [])

  function update(id: string, field: string, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
    if (field === 'background_url') {
      setImgErrors(prev => ({ ...prev, [id]: false }))
    }
  }

  async function saveShow(show: ShowConfig) {
    setSaving(show.id)
    const { error } = await supabase.from('show_configs').update(edits[show.id]).eq('id', show.id)
    setSaving(null)
    if (!error) { setSaved(show.id); setTimeout(() => setSaved(null), 2500) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={24} className="animate-spin text-nova-muted" />
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-display text-3xl text-white tracking-wide mb-1">Settings</h1>
        <p className="text-sm font-body text-nova-muted">
          Voice, avatar, and brand settings for each show.
        </p>
      </div>

      {/* Voice mode info */}
      <div className="nova-card border-nova-gold/20">
        <h2 className="font-display text-nova-gold text-lg tracking-wide mb-3">Voice modes</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm font-body">
          <div className="p-3 rounded-lg border border-nova-teal/30 bg-nova-teal/5">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-nova-teal" />
              <p className="text-nova-teal font-semibold text-xs tracking-wide uppercase">Mode A — Preferred</p>
            </div>
            <p className="text-white font-semibold mb-1">HeyGen Voice ID</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              One API call — HeyGen handles voice + avatar together. Best sync and fastest.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-nova-border bg-nova-navydark/40">
            <p className="text-nova-muted text-xs tracking-wide uppercase font-mono mb-1">Mode B — Fallback</p>
            <p className="text-white font-semibold mb-1">ElevenLabs Voice ID</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              ElevenLabs audio first, then HeyGen avatar. Two API calls.
            </p>
          </div>
        </div>
      </div>

      {/* Per-show config */}
      {shows.map(show => {
        const color  = SHOW_COLORS[show.show_name] ?? '#C9A84C'
        const edit   = edits[show.id] ?? { voice_id: '', avatar_id: '', heygen_voice_id: '', description: '', background_url: '' }
        const mode   = edit.heygen_voice_id.trim() ? 'A' : edit.voice_id.trim() ? 'B' : null
        const hasBg  = Boolean(edit.background_url.trim())
        const imgOk  = hasBg && !imgErrors[show.id]

        return (
          <div key={show.id} className="nova-card space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 rounded-full" style={{ backgroundColor: color }} />
                <div>
                  <h3 className="font-display text-white text-xl tracking-wide">{show.display_name}</h3>
                  <p className="text-xs font-mono" style={{ color }}>{show.day_of_week}</p>
                </div>
              </div>
              <span className={`nova-badge ${
                mode === 'A' ? 'bg-nova-teal/20 text-nova-teal' :
                mode === 'B' ? 'bg-nova-border/60 text-nova-muted' :
                'bg-nova-crimson/20 text-nova-crimson'
              }`}>
                {mode === 'A' ? '⚡ Mode A — HeyGen' :
                 mode === 'B' ? 'Mode B — ElevenLabs' :
                 '⚠ Needs voice config'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Description</label>
              <input value={edit.description} onChange={e => update(show.id, 'description', e.target.value)}
                placeholder="Short show description…" className="nova-input" />
            </div>

            {/* HeyGen */}
            <div>
              <p className="text-xs font-mono text-nova-teal mb-2 uppercase tracking-widest flex items-center gap-1.5">
                <Zap size={11} /> HeyGen
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                    HeyGen Voice ID <span className="text-nova-teal">(Mode A)</span>
                  </label>
                  <input value={edit.heygen_voice_id}
                    onChange={e => update(show.id, 'heygen_voice_id', e.target.value)}
                    placeholder="e.g. 27dd6930bc0444fb…"
                    className="nova-input font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                    HeyGen Avatar ID
                  </label>
                  <input value={edit.avatar_id}
                    onChange={e => update(show.id, 'avatar_id', e.target.value)}
                    placeholder="e.g. 1244e891015a4e79…"
                    className="nova-input font-mono text-xs" />
                </div>
              </div>
            </div>

            {/* ElevenLabs */}
            <div>
              <p className="text-xs font-mono text-nova-muted mb-2 uppercase tracking-widest">
                ElevenLabs Voice ID (Mode B fallback)
              </p>
              <input value={edit.voice_id}
                onChange={e => update(show.id, 'voice_id', e.target.value)}
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                className="nova-input font-mono text-xs" />
            </div>

            {/* Brand background */}
            <div>
              <p className="text-xs font-mono text-nova-violet mb-2 uppercase tracking-widest flex items-center gap-1.5">
                <ImageIcon size={11} /> TTN Brand Background
              </p>

              {/* Thumbnail + URL row */}
              <div className="flex gap-3 items-start">

                {/* Thumbnail */}
                <div
                  className="shrink-0 w-16 rounded-lg overflow-hidden border border-nova-border/50 flex items-center justify-center"
                  style={{ aspectRatio: '9/16', backgroundColor: `${color}18` }}
                >
                  {imgOk ? (
                    <img
                      src={edit.background_url}
                      alt={`${show.display_name} background`}
                      className="w-full h-full object-cover"
                      onError={() => setImgErrors(prev => ({ ...prev, [show.id]: true }))}
                    />
                  ) : hasBg && imgErrors[show.id] ? (
                    <div className="flex flex-col items-center gap-1 p-1">
                      <X size={14} className="text-nova-crimson" />
                      <span className="text-nova-crimson text-xs font-mono text-center leading-tight">bad URL</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 p-1">
                      <ImageIcon size={14} className="text-nova-muted/40" />
                      <span className="text-nova-muted/40 text-xs font-mono text-center leading-tight">no bg</span>
                    </div>
                  )}
                </div>

                {/* URL input + status */}
                <div className="flex-1 space-y-1.5">
                  <input
                    value={edit.background_url}
                    onChange={e => update(show.id, 'background_url', e.target.value)}
                    placeholder="https://… background image URL"
                    className={`nova-input font-mono text-xs ${
                      imgOk ? 'border-nova-violet/50' : ''
                    }`}
                  />
                  {imgOk && (
                    <p className="text-xs font-mono text-nova-violet flex items-center gap-1">
                      <CheckCircle size={10} /> Active — custom background set
                    </p>
                  )}
                  {!hasBg && (
                    <p className="text-xs font-mono text-nova-muted/60">
                      Using show color <span className="font-mono" style={{ color }}>{color}</span> as fallback
                    </p>
                  )}
                  {hasBg && imgErrors[show.id] && (
                    <p className="text-xs font-mono text-nova-crimson">
                      Image failed to load — check the URL
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button onClick={() => saveShow(show)} disabled={saving === show.id}
                className="nova-btn-primary flex items-center gap-2 text-sm">
                {saving === show.id ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                 : saved === show.id  ? <><CheckCircle size={14} /> Saved</>
                 : <><Save size={14} /> Save</>}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
