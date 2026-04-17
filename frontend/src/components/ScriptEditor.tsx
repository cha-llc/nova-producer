import { useState } from 'react'
import { Loader2, Send, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ShowConfig, ShowScript } from '../types'

interface Props {
  shows: ShowConfig[]
  onSaved?: (script: ShowScript) => void
}

export default function ScriptEditor({ shows, onSaved }: Props) {
  const [selectedShow, setSelectedShow] = useState('')
  const [scriptText, setScriptText]     = useState('')
  const [caption, setCaption]           = useState('')
  const [status, setStatus]             = useState<'idle' | 'saving' | 'queuing' | 'done' | 'error'>('idle')
  const [msg, setMsg]                   = useState('')

  const charCount = scriptText.length
  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0

  async function handleSave(asDraft: boolean) {
    if (!selectedShow || !scriptText.trim()) {
      setMsg('Select a show and enter a script.')
      return
    }
    setStatus(asDraft ? 'saving' : 'queuing')
    setMsg('')

    const { data, error } = await supabase
      .from('show_scripts')
      .insert({
        show_id: selectedShow,
        script_text: scriptText.trim(),
        caption: caption.trim(),
        status: asDraft ? 'draft' : 'ready',
      })
      .select('*, show:show_configs(*)')
      .single()

    if (error) {
      setStatus('error')
      setMsg(`Error: ${error.message}`)
      return
    }

    setStatus('done')
    setMsg(asDraft ? 'Saved as draft.' : '✅ Script queued — NOVA is producing your episode.')
    onSaved?.(data as ShowScript)
    if (!asDraft) { setScriptText(''); setCaption(''); setSelectedShow('') }
    setTimeout(() => setStatus('idle'), 3000)
  }

  const show = shows.find(s => s.id === selectedShow)

  return (
    <div className="nova-card space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-nova-gold" />
        <h2 className="font-display text-white text-xl tracking-wide">New Script</h2>
      </div>

      {/* Show selector */}
      <div>
        <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Show</label>
        <select
          value={selectedShow}
          onChange={e => setSelectedShow(e.target.value)}
          className="nova-input"
        >
          <option value="">— Select a show —</option>
          {shows.map(s => (
            <option key={s.id} value={s.id}>{s.display_name}</option>
          ))}
        </select>
      </div>

      {/* Script text */}
      <div>
        <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">Script</label>
        <textarea
          value={scriptText}
          onChange={e => setScriptText(e.target.value)}
          placeholder="Paste or type your full show script here. NOVA will read it in your voice..."
          rows={12}
          className="nova-input resize-y font-body text-sm leading-relaxed"
        />
        <div className="flex gap-4 mt-1">
          <span className="text-xs font-mono text-nova-muted">{wordCount} words</span>
          <span className="text-xs font-mono text-nova-muted">{charCount} chars</span>
          <span className="text-xs font-mono text-nova-muted">
            ~{Math.round(wordCount / 140)} min read
          </span>
        </div>
      </div>

      {/* Caption */}
      <div>
        <label className="block text-xs font-mono text-nova-muted mb-1.5 uppercase tracking-widest">
          Social Caption
        </label>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Caption for TikTok, IG, YouTube, Pinterest posts..."
          rows={3}
          className="nova-input resize-none text-sm"
        />
      </div>

      {/* Voice / Avatar info */}
      {show && (
        <div className="flex gap-3 p-3 bg-nova-navydark/60 rounded-lg border border-nova-border/50">
          <div className="text-xs font-mono text-nova-muted">
            <span className="text-nova-teal">VOICE</span>{' '}
            {show.voice_id ? show.voice_id.slice(0, 12) + '…' : <span className="text-nova-crimson">Not configured</span>}
          </div>
          <div className="text-xs font-mono text-nova-muted">
            <span className="text-nova-violet">AVATAR</span>{' '}
            {show.avatar_id ? show.avatar_id.slice(0, 12) + '…' : <span className="text-nova-crimson">Not configured</span>}
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
          className="nova-btn-ghost flex items-center gap-2"
        >
          {status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Draft
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={status === 'saving' || status === 'queuing' || !show?.voice_id || !show?.avatar_id}
          className="nova-btn-primary flex items-center gap-2"
        >
          {status === 'queuing' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Produce with NOVA
        </button>
      </div>
    </div>
  )
}
