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
          voice_id:        show.voice_id,
          avatar_id:       show.avatar_id,
          heygen_voice_id: show.heygen_voice_id ?? '',
          description:     show.description,
        }
      }
      setEdits(init)
      setLoading(false)
    })
  }, [])

  function update(id: string, field: string, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveShow(show: ShowConfig) {
    setSaving(show.id)
    const { error } = await supabase
      .from('show_configs')
      .update(edits[show.id])
      .eq('id', show.id)
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
          Configure voice and avatar for each show. NOVA uses these every time it produces an episode.
        </p>
      </div>

      {/* Voice mode info */}
      <div className="nova-card border-nova-gold/20">
        <h2 className="font-display text-nova-gold text-lg tracking-wide mb-3">Two voice modes</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm font-body">
          <div className="p-3 rounded-lg border border-nova-teal/30 bg-nova-teal/5">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-nova-teal" />
              <p className="text-nova-teal font-semibold text-xs tracking-wide uppercase">Mode A — Preferred</p>
            </div>
            <p className="text-white font-semibold mb-1">HeyGen Voice ID</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              Uses HeyGen's built-in voice clone. One API call — voice and avatar generate together.
              Best sync, fastest pipeline. <strong className="text-white">Recommended.</strong>
            </p>
          </div>
          <div className="p-3 rounded-lg border border-nova-border bg-nova-navydark/40">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-nova-muted text-xs tracking-wide uppercase font-mono">Mode B — Fallback</span>
            </div>
            <p className="text-white font-semibold mb-1">ElevenLabs Voice ID</p>
            <p className="text-nova-muted text-xs leading-relaxed">
              Generates audio via ElevenLabs first, then passes it to HeyGen.
              Two API calls. Use if HeyGen voice isn't set.
            </p>
          </div>
        </div>
        <p className="text-xs font-mono text-nova-muted mt-3">
          If HeyGen Voice ID is filled in, Mode A is used automatically. ElevenLabs ID is ignored.
        </p>
      </div>

      {/* How to get IDs */}
      <div className="nova-card">
        <h2 className="font-display text-white text-lg tracking-wide mb-3">Where to get your IDs</h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm font-body text-nova-muted">
          <div>
            <p className="text-nova-teal font-semibold mb-1">HeyGen Voice ID</p>
            <p>Go to <a href="https://app.heygen.com/voice-cloning" target="_blank" rel="noreferrer" className="text-nova-teal hover:underline">HeyGen → Voice Cloning</a>. Click your cloned voice → copy the ID shown on that page.</p>
          </div>
          <div>
            <p className="text-white font-semibold mb-1">HeyGen Avatar ID</p>
            <p>Go to <a href="https://app.heygen.com/avatars" target="_blank" rel="noreferrer" className="text-nova-teal hover:underline">HeyGen → Avatars</a>. Click your instant avatar → copy the avatar ID.</p>
          </div>
          <div>
            <p className="text-nova-muted font-semibold mb-1">ElevenLabs Voice ID</p>
            <p>Go to <a href="https://elevenlabs.io/app/voice-lab" target="_blank" rel="noreferrer" className="text-nova-teal hover:underline">ElevenLabs → Voice Lab</a>. Click your voice → copy the ID from the URL or detail panel.</p>
          </div>
        </div>
      </div>

      {/* Show configs */}
      {shows.map(show => {
        const color = SHOW_COLORS[show.show_name] ?? '#C9A84C'
        const edit  = edits[show.id] ?? { voice_id: '', avatar_id: '', heygen_voice_id: '', description: '' }
        const mode  = edit.heygen_voice_id.trim() ? 'A' : edit.voice_id.trim() ? 'B' : null
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
              <span className={`nova-badge ${
                mode === 'A' ? 'bg-nova-teal/20 text-nova-teal' :
                mode === 'B' ? 'bg-nova-border/60 text-nova-muted' :
                'bg-nova-crimson/20 text-nova-crimson'
              }`}>
                {mode === 'A' ? '⚡ Mode A — HeyGen voice' :
                 mode === 'B' ? 'Mode B — ElevenLabs' :
                 '⚠ Needs voice config'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Description</label>
              <input value={edit.description} onChange={e => update(show.id, 'description', e.target.value)}
                placeholder="Short show description…" className="nova-input" />
            </div>

            {/* HeyGen — both IDs side by side */}
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
                    placeholder="e.g. 6b2f...  ← your cloned voice"
                    className="nova-input font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                    HeyGen Avatar ID
                  </label>
                  <input value={edit.avatar_id}
                    onChange={e => update(show.id, 'avatar_id', e.target.value)}
                    placeholder="e.g. abe6c9d89b6a471fa2a5…"
                    className="nova-input font-mono text-xs" />
                </div>
              </div>
            </div>

            {/* ElevenLabs fallback */}
            <div>
              <p className="text-xs font-mono text-nova-muted mb-2 uppercase tracking-widest">
                ElevenLabs (Mode B fallback — optional if HeyGen voice is set)
              </p>
              <input value={edit.voice_id}
                onChange={e => update(show.id, 'voice_id', e.target.value)}
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                className="nova-input font-mono text-xs" />
            </div>

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
