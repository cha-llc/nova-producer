import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle } from 'lucide-react'
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
  const [edits, setEdits]   = useState<Record<string, { voice_id: string; avatar_id: string; description: string }>>({})
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
          voice_id:    show.voice_id,
          avatar_id:   show.avatar_id,
          description: show.description,
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
    if (!error) {
      setSaved(show.id)
      setTimeout(() => setSaved(null), 2500)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-nova-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-display text-3xl text-white tracking-wide mb-1">Settings</h1>
        <p className="text-sm font-body text-nova-muted">
          Configure ElevenLabs voice IDs and HeyGen avatar IDs for each show.
          NOVA uses these every time it produces an episode.
        </p>
      </div>

      {/* How to get IDs */}
      <div className="nova-card border-nova-gold/20">
        <h2 className="font-display text-nova-gold text-lg tracking-wide mb-3">Where to get your IDs</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm font-body text-nova-muted">
          <div>
            <p className="text-white font-semibold mb-1">ElevenLabs Voice ID</p>
            <p>Go to <a href="https://elevenlabs.io/app/voice-lab" target="_blank" rel="noreferrer" className="text-nova-teal hover:underline">elevenlabs.io → Voice Lab</a>.
            Clone your voice, then click the voice → copy the ID from the URL.</p>
          </div>
          <div>
            <p className="text-white font-semibold mb-1">HeyGen Avatar ID</p>
            <p>Go to <a href="https://app.heygen.com/avatars" target="_blank" rel="noreferrer" className="text-nova-teal hover:underline">app.heygen.com → Avatars</a>.
            Create an instant avatar, then copy the avatar ID from the avatar detail page.</p>
          </div>
        </div>
      </div>

      {/* Show configs */}
      {shows.map(show => {
        const color = SHOW_COLORS[show.show_name] ?? '#C9A84C'
        const edit  = edits[show.id] ?? { voice_id: '', avatar_id: '', description: '' }
        const isConfigured = edit.voice_id && edit.avatar_id
        return (
          <div key={show.id} className="nova-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-10 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div>
                  <h3 className="font-display text-white text-xl tracking-wide">{show.display_name}</h3>
                  <p className="text-xs font-mono" style={{ color }}>
                    {show.day_of_week} · {show.show_name}
                  </p>
                </div>
              </div>
              <span className={`nova-badge ${isConfigured ? 'bg-green-900/30 text-green-400' : 'bg-nova-crimson/20 text-nova-crimson'}`}>
                {isConfigured ? '✓ Ready' : '⚠ Needs config'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                Description
              </label>
              <input
                value={edit.description}
                onChange={e => update(show.id, 'description', e.target.value)}
                placeholder="Short show description..."
                className="nova-input"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                  ElevenLabs Voice ID
                </label>
                <input
                  value={edit.voice_id}
                  onChange={e => update(show.id, 'voice_id', e.target.value)}
                  placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                  className="nova-input font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
                  HeyGen Avatar ID
                </label>
                <input
                  value={edit.avatar_id}
                  onChange={e => update(show.id, 'avatar_id', e.target.value)}
                  placeholder="e.g. abe6c9d89b6a471fa2a5..."
                  className="nova-input font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => saveShow(show)}
                disabled={saving === show.id}
                className="nova-btn-primary flex items-center gap-2 text-sm"
              >
                {saving === show.id
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : saved === show.id
                  ? <><CheckCircle size={14} /> Saved</>
                  : <><Save size={14} /> Save</>
                }
              </button>
            </div>
          </div>
        )
      })}

      {/* Secrets reminder */}
      <div className="nova-card border-nova-border/40 bg-nova-navydark/40">
        <h2 className="font-display text-nova-muted text-lg tracking-wide mb-2">Supabase Secrets Required</h2>
        <p className="text-xs font-mono text-nova-muted mb-3">
          Set these once via the Supabase dashboard or CLI. Never stored in the frontend.
        </p>
        <div className="space-y-1.5">
          {['ELEVENLABS_API_KEY', 'HEYGEN_API_KEY', 'SOCIALBLU_API_KEY'].map(key => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nova-muted" />
              <code className="text-xs font-mono text-nova-muted">{key}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
