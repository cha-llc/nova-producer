import GuestGate from '../components/GuestGate'
import { useEffect, useState } from 'react'
import { Mic, Loader2, Check, Play, AlertCircle, RefreshCw, PlusCircle, Volume2 } from 'lucide-react'
import type { NovaVoiceClone } from '../types'

const SUPABASE_URL    = 'https://vzzzqsmqqaoilkmskadl.supabase.co'
const VOICE_CLONE_URL = `${SUPABASE_URL}/functions/v1/nova-voice-clone`

interface ELVoice { voice_id: string; name: string; preview_url: string; category: string; fine_tuning?: string }

const SHOW_NAMES = ['sunday_power_hour','motivation_court','tea_time_with_cj','confession_court']

export default function Voice() {
  const [clones, setClones]       = useState<NovaVoiceClone[]>([])
  const [elVoices, setElVoices]   = useState<ELVoice[]>([])
  const [stdVoices, setStdVoices] = useState<ELVoice[]>([])
  const [loading, setLoading]     = useState(true)
  const [testing, setTesting]     = useState<string | null>(null)
  const [testAudio, setTestAudio] = useState<Record<string, string>>({})
  const [creating, setCreating]   = useState(false)
  const [error, setError]         = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', audioUrls: '' })
  const [assignShow, setAssignShow]   = useState('')
  const [assignVoice, setAssignVoice] = useState('')
  const [assigning, setAssigning]     = useState(false)
  const [assignMsg, setAssignMsg]     = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${VOICE_CLONE_URL}?action=list`)
      const d = await r.json()
      if (d.success) {
        setClones(d.nova_clones || [])
        setElVoices(d.cloned_voices || [])
        setStdVoices(d.standard_voices || [])
      } else {
        setError(d.error || 'Failed to load voices')
      }
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // For standard voices: use preview_url directly (no API key needed)
  // For cloned voices: call backend test action (requires ELEVENLABS_API_KEY)
  const testVoice = async (voice: ELVoice) => {
    setTesting(voice.voice_id)
    setError('')
    try {
      if (voice.preview_url && voice.category !== 'cloned') {
        // Standard voice: play preview URL directly
        setTestAudio(prev => ({ ...prev, [voice.voice_id]: voice.preview_url }))
      } else {
        // Cloned voice: generate via backend
        const r = await fetch(`${VOICE_CLONE_URL}?action=test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_id: voice.voice_id }),
        })
        const d = await r.json()
        if (d.success) setTestAudio(prev => ({ ...prev, [voice.voice_id]: d.audio_url }))
        else setError(d.error || 'Test failed')
      }
    } catch (e) { setError(String(e)) }
    setTesting(null)
  }

  const createClone = async () => {
    if (!form.name || !form.audioUrls.trim()) return
    setCreating(true); setError('')
    try {
      const urls = form.audioUrls.split('\n').map(u => u.trim()).filter(Boolean)
      const r = await fetch(`${VOICE_CLONE_URL}?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, audio_urls: urls }),
      })
      const d = await r.json()
      if (d.success) {
        setShowCreateForm(false)
        setForm({ name: '', description: '', audioUrls: '' })
        load()
      } else {
        setError(d.error || 'Clone creation failed')
      }
    } catch (e) { setError(String(e)) }
    setCreating(false)
  }

  const assignToShow = async () => {
    if (!assignShow || !assignVoice) return
    setAssigning(true); setAssignMsg('')
    try {
      const r = await fetch(`${VOICE_CLONE_URL}?action=assign_to_show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_name: assignShow, voice_id: assignVoice }),
      })
      const d = await r.json()
      if (d.success) setAssignMsg('Assigned to ' + assignShow.replace(/_/g, ' '))
      else setError(d.error || 'Assignment failed')
    } catch (e) { setError(String(e)) }
    setAssigning(false)
  }

  const allVoices = [...elVoices, ...stdVoices.slice(0, 10)]

  return (
    <GuestGate pageName="Voice Studio">
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
            <Mic size={28} className="text-nova-teal" /> VOICE STUDIO
          </h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            Clone your voice and assign it to any show
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-teal text-white text-sm font-body hover:bg-nova-teal/80 transition-all">
            <PlusCircle size={14} /> Clone Your Voice
          </button>
          <button onClick={load} className="nova-btn-ghost p-2"><RefreshCw size={14} /></button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-nova-crimson/10 border border-nova-crimson/30 flex items-center gap-2">
          <AlertCircle size={14} className="text-nova-crimson flex-shrink-0" />
          <p className="text-xs font-mono text-nova-crimson">{error}</p>
        </div>
      )}

      {showCreateForm && (
        <div className="nova-card border border-nova-teal/30">
          <h3 className="font-display text-lg text-nova-teal mb-4 flex items-center gap-2">
            <Mic size={18} /> Clone Your Voice
          </h3>
          <p className="text-xs font-mono text-nova-muted mb-4">
            Provide 3-5 audio samples of your voice as public URLs from Supabase Storage or any hosted audio.
            Each sample should be 30s to 3min of clean speech. More samples means a better clone.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1">Clone Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="nova-input w-full" placeholder="CJ H. Adisa NOVA Voice" />
            </div>
            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="nova-input w-full" placeholder="CJ voice for Tea Time Network shows" />
            </div>
            <div>
              <label className="block text-xs font-mono text-nova-muted mb-1">Audio URLs (one per line) *</label>
              <textarea value={form.audioUrls} onChange={e => setForm(f => ({ ...f, audioUrls: e.target.value }))}
                className="nova-input w-full h-28 resize-none"
                placeholder="https://your-storage.supabase.co/.../sample1.mp3" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={createClone} disabled={creating || !form.name || !form.audioUrls.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-teal text-white text-sm font-body hover:bg-nova-teal/80 disabled:opacity-50 transition-all">
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creating Clone...</> : <><Mic size={14} /> Create Voice Clone</>}
              </button>
              <button onClick={() => setShowCreateForm(false)} className="nova-btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="nova-card">
        <h3 className="font-display text-base text-white mb-3 flex items-center gap-2">
          <Volume2 size={15} className="text-nova-gold" /> Assign Voice to Show
        </h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-mono text-nova-muted mb-1">Show</label>
            <select value={assignShow} onChange={e => setAssignShow(e.target.value)} className="nova-input">
              <option value="">Select show...</option>
              {SHOW_NAMES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-nova-muted mb-1">Voice ID</label>
            <select value={assignVoice} onChange={e => setAssignVoice(e.target.value)} className="nova-input min-w-48">
              <option value="">Select voice...</option>
              {allVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name} ({v.category})</option>)}
            </select>
          </div>
          <button onClick={assignToShow} disabled={assigning || !assignShow || !assignVoice}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-gold text-nova-navy text-sm font-body hover:bg-nova-gold/80 disabled:opacity-50 transition-all">
            {assigning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Assign
          </button>
          {assignMsg && <span className="text-xs font-mono text-nova-teal">{assignMsg}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-nova-muted text-sm py-8">
          <Loader2 size={14} className="animate-spin" /> Loading voices...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-mono text-nova-muted uppercase tracking-widest flex items-center gap-2">
              <Mic size={11} /> Your Cloned Voices ({elVoices.length})
            </p>
            {elVoices.length === 0 ? (
              <div className="nova-card text-center py-8">
                <Mic size={24} className="text-nova-muted/40 mx-auto mb-2" />
                <p className="text-sm font-mono text-nova-muted">No voice clones yet.</p>
                <p className="text-xs font-mono text-nova-muted mt-1">Click Clone Your Voice to get started.</p>
              </div>
            ) : elVoices.map(v => (
              <div key={v.voice_id} className="nova-card border border-nova-teal/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-white text-sm font-semibold">{v.name}</p>
                    <p className="text-xs font-mono text-nova-teal mt-0.5">{v.voice_id}</p>
                    {v.fine_tuning && v.fine_tuning !== 'not_started' && (
                      <p className="text-xs font-mono text-nova-gold mt-0.5">Fine-tuning: {v.fine_tuning}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-nova-teal/15 text-nova-teal">Cloned</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => testVoice(v)} disabled={testing === v.voice_id}
                    className="flex items-center gap-1.5 text-xs font-mono text-nova-muted border border-nova-border/50 px-3 py-1.5 rounded-lg hover:text-nova-teal hover:border-nova-teal/40 transition-all disabled:opacity-40">
                    {testing === v.voice_id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    Test Voice
                  </button>
                  {testAudio[v.voice_id] && (
                    <audio controls src={testAudio[v.voice_id]} className="h-8 flex-1" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-mono text-nova-muted uppercase tracking-widest flex items-center gap-2">
              <Volume2 size={11} /> Standard Voices ({stdVoices.length})
            </p>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {stdVoices.slice(0, 15).map(v => (
                <div key={v.voice_id} className="nova-card py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-body text-white">{v.name}</p>
                    <p className="text-[10px] font-mono text-nova-muted">{v.voice_id}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {testAudio[v.voice_id] && (
                      <audio controls src={testAudio[v.voice_id]} className="h-7 w-32" />
                    )}
                    <button onClick={() => testVoice(v)} disabled={testing === v.voice_id}
                      className="text-nova-muted hover:text-nova-gold transition-colors p-1">
                      {testing === v.voice_id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </GuestGate>
  )
}