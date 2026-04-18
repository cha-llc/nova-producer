import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Send, Save, Settings, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ShowConfig, ShowScript } from '../types'

interface Props {
  shows: ShowConfig[]
  onSaved?: (script: ShowScript) => void
}

export default function ScriptEditor({ shows, onSaved }: Props) {
  const navigate = useNavigate()
  const [selectedShow, setSelectedShow] = useState('')
  const [scriptText, setScriptText]     = useState('')
  const [caption, setCaption]           = useState('')
  const [status, setStatus]             = useState<'idle' | 'saving' | 'queuing' | 'done' | 'error'>('idle')
  const [msg, setMsg]                   = useState('')

  const charCount = scriptText.length
  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0
  const show      = shows.find(s => s.id === selectedShow)

  // Voice config — prefer HeyGen, fall back to ElevenLabs
  const hasHeyGenVoice  = Boolean(show?.heygen_voice_id?.trim())
  const hasElevenLabs   = Boolean(show?.voice_id?.trim())
  const hasAvatar       = Boolean(show?.avatar_id?.trim())
  const hasAnyVoice     = hasHeyGenVoice || hasElevenLabs
  const readyToProduce  = hasAnyVoice && hasAvatar

  // Voice status label
  const voiceLabel = hasHeyGenVoice
    ? `HeyGen · ${show!.heygen_voice_id.slice(0, 10)}…`
    : hasElevenLabs
    ? `ElevenLabs · ${show!.voice_id.slice(0, 10)}…`
    : null

  const voiceMode = hasHeyGenVoice ? 'A' : hasElevenLabs ? 'B' : null

  async function handleSave(asDraft: boolean) {
    if (!selectedShow || !scriptText.trim()) {
      setMsg('Select a show and enter a script.')
      return
    }
    if (!asDraft && !readyToProduce) {
      setMsg('Voice and avatar must be configured in Settings first.')
      return
    }
    setStatus(asDraft ? 'saving' : 'queuing')
    setMsg('')

    const { data, error } = await supabase
      .from('show_scripts')
      .insert({
        show_id:     selectedShow,
        script_text: scriptText.trim(),
        caption:     caption.trim(),
        status:      asDraft ? 'draft' : 'ready',
      })
      .select('*, show:show_configs(*)')
      .single()

    if (error) {
      setStatus('error')
      setMsg(`Error: ${error.message}`)
      return
    }

    setStatus('done')
    setMsg(asDraft
      ? '✓ Saved as draft.'
      : '✅ Script queued — NOVA is producing your episode. Check #nova in Slack.')
    onSaved?.(data as ShowScript)
    if (!asDraft) {
      setScriptText('')
      setCaption('')
      setSelectedShow('')
    }
    setTimeout(() => setStatus('idle'), 4000)
  }

  return (
    <div className="nova-card space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-nova-gold" />
        <h2 className="font-display text-white text-xl tracking-wide">New Script</h2>
      </div>

      {/* Show selector */}
      <div>
        <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Show</label>
        <select value={selectedShow} onChange={e => setSelectedShow(e.target.value)} className="nova-input">
          <option value="">— Select a show —</option>
          {shows.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
      </div>

      {/* Script text */}
      <div>
        <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Script</label>
        <textarea
          value={scriptText}
          onChange={e => setScriptText(e.target.value)}
          placeholder="Paste or type your full show script here. NOVA will read it in your voice…"
          rows={12}
          className="nova-input resize-y font-body text-sm leading-relaxed"
        />
        <div className="flex gap-4 mt-1">
          <span className="text-xs font-mono text-nova-muted">{wordCount} words</span>
          <span className="text-xs font-mono text-nova-muted">{charCount} chars</span>
          <span className="text-xs font-mono text-nova-muted">~{Math.max(1, Math.round(wordCount / 140))} min</span>
        </div>
      </div>

      {/* Caption */}
      <div>
        <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Social Caption</label>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Caption for TikTok, IG, YouTube, Pinterest, Reddit…"
          rows={3}
          className="nova-input resize-none text-sm"
        />
      </div>

      {/* Voice / Avatar status */}
      {show && (
        <div className="p-3 bg-nova-navydark/60 rounded-lg border border-nova-border/50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic size={12} className={hasAnyVoice ? 'text-nova-teal' : 'text-nova-crimson'} />
              <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Voice</span>
            </div>
            {hasAnyVoice ? (
              <div className="flex items-center gap-2">
                <span className={`nova-badge ${voiceMode === 'A' ? 'bg-nova-teal/20 text-nova-teal' : 'bg-nova-border/60 text-nova-muted'}`}>
                  Mode {voiceMode}
                </span>
                <span className="text-xs font-mono text-white/60">{voiceLabel}</span>
              </div>
            ) : (
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 text-xs font-mono text-nova-crimson hover:text-white transition-colors"
              >
                <Settings size={11} />
                Not configured — go to Settings
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${hasAvatar ? 'bg-nova-violet' : 'bg-nova-crimson'}`} />
              <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Avatar</span>
            </div>
            {hasAvatar ? (
              <span className="text-xs font-mono text-white/60">{show.avatar_id.slice(0, 12)}…</span>
            ) : (
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 text-xs font-mono text-nova-crimson hover:text-white transition-colors"
              >
                <Settings size={11} />
                Not configured — go to Settings
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <p className={`text-sm font-body ${status === 'error' ? 'text-nova-crimson' : 'text-nova-teal'}`}>
          {msg}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => handleSave(true)}
          disabled={status === 'saving' || status === 'queuing'}
          className="nova-btn-ghost flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Draft
        </button>

        {show && !readyToProduce ? (
          <button
            onClick={() => navigate('/settings')}
            className="nova-btn-primary flex items-center gap-2 opacity-60"
            title="Voice and avatar must be configured in Settings"
          >
            <Settings size={14} />
            Configure in Settings first
          </button>
        ) : (
          <button
            onClick={() => handleSave(false)}
            disabled={status === 'saving' || status === 'queuing' || !selectedShow || !scriptText.trim()}
            className="nova-btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'queuing' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Produce with NOVA
          </button>
        )}
      </div>
    </div>
  )
}
