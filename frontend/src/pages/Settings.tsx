import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle, Zap } from 'lucide-react'
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
    voice_id: string; avatar_id: string; heygen_voice_id: string; description: string
  }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('show_configs').select('*').order('display_name').then(({ data }) => {
      const s = data ?? []
      setShows(s)
      const init: typeof edits = {}
      for (const show of s) {
        init[show.id] = {
          voice_id:        show.voice_id        ?? '',
          avatar_id:       show.avatar_id       ?? '',
          heygen_voice_id: show.heygen_voice_id ?? '',
          description:     show.description     ?? '',
        }
      }
      setEdits(init)
      setLoading(false)
    })
  }, [])

  function update(id: string, field: string, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function getMode(edit: { heygen_voice_id: string; voice_id: string; avatar_id: string }) {
    if (edit.heygen_voice_id.trim()) return 'A'
    if (edit.voice_id.trim())        return 'B'
    if (edit.avatar_id.trim())       return 'C'
    return null
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
        <p className="text-sm font-body text-nova-muted">Configure voice and avatar for each show.</p>
      </div>

      {/* Three modes */}
      <div className="nova-card border-nova-gold/20">
        <h2 className="font-display text-nova-gold text-lg tracking-wide mb-3">How NOVA picks your voice</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm font-body">
          <div className="p-3 rounded-lg border border-nova-teal/30 bg-nova-teal/5">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={12} className="text-nova-teal" />
              <span className="text-nova-teal font-semibold text-xs uppercase tracking-wide">Mode C — Recommended</span>
            </div>
            <p className="text-white font-semibold mb-0.5">Instant Avatar</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              Your HeyGen Instant Avatar already has your voice baked in. <strong className="text-white">No voice ID needed.</strong> Just paste your Avatar ID and go.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-nova-border/50 bg-nova-navydark/30">
            <span className="text-nova-muted text-xs uppercase tracking-wide">Mode A</span>
            <p className="text-white font-semibold mb-0.5 mt-0.5">HeyGen Voice ID</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              If HeyGen assigns a separate voice ID to your clone (rare for Instant Avatars), paste it here.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-nova-border/50 bg-nova-navydark/30">
            <span className="text-nova-muted text-xs uppercase tracking-wide">Mode B</span>
            <p className="text-white font-semibold mb-0.5 mt-0.5">ElevenLabs</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              Generates audio via ElevenLabs, then passes it to HeyGen. Two API calls.
            </p>
          </div>
        </div>
        <p className="text-xs font-mono text-nova-muted mt-3 border-t border-nova-border pt-3">
          Priority: Mode A → Mode B → Mode C. If only Avatar ID is set, Mode C runs automatically.
        </p>
      </div>

      {/* How to get Avatar ID */}
      <div className="nova-card">
        <h2 className="font-display text-white text-lg tracking-wide mb-2">Where to find your Avatar ID</h2>
        <p className="text-sm font-body text-nova-muted">
          Go to <a href="https://app.heygen.com/avatars" target="_blank" rel="noreferrer" className="text-nova-teal hover:underline">app.heygen.com/avatars</a> → click your Instant Avatar → copy the avatar ID shown in the URL or detail panel. It starts with a UUID-style string (e.g. <span className="font-mono text-white/60">1244e891015a…</span>).
        </p>
      </div>

      {/* Show configs */}
      {shows.map(show => {
        const color = SHOW_COLORS[show.show_name] ?? '#C9A84C'
        const edit  = edits[show.id] ?? { voice_id: '', avatar_id: '', heygen_voice_id: '', description: '' }
        const mode  = getMode(edit)
        const modeText = mode === 'A' ? '⚡ Mode A — HeyGen voice'
                       : mode === 'B' ? 'Mode B — ElevenLabs'
                       : mode === 'C' ? '🎙 Mode C — Instant Avatar'
                       : '⚠ No avatar configured'
        const badgeCls = mode === 'A' ? 'bg-nova-teal/20 text-nova-teal'
                       : mode === 'C' ? 'bg-nova-teal/20 text-nova-teal'
                       : mode === 'B' ? 'bg-nova-border/60 text-nova-muted'
                       : 'bg-nova-crimson/20 text-nova-crimson'
        return (
          <div key={show.id} className="nova-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 rounded-full" style={{ backgroundColor: color }} />
                <div>
                  <h3 className="font-display text-white text-xl tracking-wide">{show.display_name}</h3>
                  <p className="text-xs font-mono" style={{ color }}>{show.day_of_week}</p>
                </div>
              </div>
              <span className={`nova-badge ${badgeCls}`}>{modeText}</span>
            </div>

            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Description</label>
              <input value={edit.description} onChange={e => update(show.id, 'description', e.target.value)}
                placeholder="Short show description…" className="nova-input" />
            </div>

            {/* Avatar ID — required */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-mono text-white uppercase tracking-widest">HeyGen Avatar ID</label>
                <span className="text-xs font-mono text-nova-teal">(required)</span>
              </div>
              <input value={edit.avatar_id}
                onChange={e => update(show.id, 'avatar_id', e.target.value)}
                placeholder="e.g. 1244e891015a471fa2a5… (from app.heygen.com/avatars)"
                className="nova-input font-mono text-xs" />
              <p className="text-xs text-nova-muted mt-1 font-body">
                If this is an Instant Avatar, you don't need to fill in any voice field — your voice is already inside.
              </p>
            </div>

            {/* Optional voice overrides */}
            <details className="group">
              <summary className="cursor-pointer text-xs font-mono text-nova-muted hover:text-white transition-colors py-1 select-none">
                ▸ Optional voice overrides (only needed if you have a separate voice ID)
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                    HeyGen Voice ID <span className="text-nova-muted normal-case">(Mode A — rare for Instant Avatars)</span>
                  </label>
                  <input value={edit.heygen_voice_id}
                    onChange={e => update(show.id, 'heygen_voice_id', e.target.value)}
                    placeholder="Leave blank — Instant Avatars don't need this"
                    className="nova-input font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                    ElevenLabs Voice ID <span className="text-nova-muted normal-case">(Mode B fallback)</span>
                  </label>
                  <input value={edit.voice_id}
                    onChange={e => update(show.id, 'voice_id', e.target.value)}
                    placeholder="Leave blank if using HeyGen avatar"
                    className="nova-input font-mono text-xs" />
                </div>
              </div>
            </details>

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
