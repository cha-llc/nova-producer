import GuestGate from '../components/GuestGate'
import { useEffect, useState, useCallback } from 'react'
import { Settings2, Save, Loader2, Check, ExternalLink, Info, BookOpen, Brain, Mic, Palette, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ShowConfig, NovaStyleProfile } from '../types'

const SHOW_COLORS: Record<string, string> = {
  sunday_power_hour: '#C9A84C',
  motivation_court:  '#2A9D8F',
  tea_time_with_cj:  '#9B5DE5',
  confession_court:  '#C1121F',
}

type Tab = 'shows' | 'style' | 'canva'

interface Integration { key: string; value: string; description: string }

export default function Settings() {
  const [shows, setShows]       = useState<ShowConfig[]>([])
  const [profiles, setProfiles] = useState<NovaStyleProfile[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading]   = useState(true)
  const [canvaConnecting, setCanvaConnecting] = useState(false)
  const [canvaMsg, setCanvaMsg]               = useState('')

  // Detect return from Canva OAuth (server-side redirect flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('canva')
    const msg    = params.get('msg')
    if (status === 'connected') {
      setCanvaMsg('✅ Canva connected! fal.ai + Canva composite thumbnails are now fully automated.')
      setTab('canva')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (status === 'error') {
      setCanvaMsg('❌ ' + (msg ?? 'Canva connection failed. Try again.'))
      setTab('canva')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const connectCanva = async () => {
    setCanvaConnecting(true); setCanvaMsg('')
    try {
      // Uses hardcoded URL — no env var dependency
      const r = await fetch('https://vzzzqsmqqaoilkmskadl.supabase.co/functions/v1/canva-oauth?action=auth_url')
      const d = await r.json()
      if (d.auth_url) window.location.href = d.auth_url
      else setCanvaMsg('Error: ' + (d.error ?? 'Could not generate auth URL'))
    } catch (e) { setCanvaMsg('Error: ' + String(e)) }
    setCanvaConnecting(false)
  }
  const [saving, setSaving]     = useState<string | null>(null)
  const [saved, setSaved]       = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>('shows')
  const [editConfig, setEditConfig]   = useState<Record<string, Partial<ShowConfig>>>({})
  const [editProfile, setEditProfile] = useState<Record<string, Partial<NovaStyleProfile>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: showData }, { data: profileData }, { data: integData }] = await Promise.all([
      supabase.from('show_configs').select('*').order('display_name'),
      supabase.from('nova_style_profile').select('*').order('show_name'),
      supabase.from('nova_integrations').select('key,value,description').order('key'),
    ])
    setShows(showData ?? [])
    setProfiles(profileData ?? [])
    setIntegrations(integData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveShow = async (showName: string) => {
    const patch = editConfig[showName]
    if (!patch) return
    setSaving(showName)
    await supabase.from('show_configs').update(patch).eq('show_name', showName)
    setSaved(showName); setTimeout(() => setSaved(null), 2000)
    setSaving(null); load()
  }

  const saveProfile = async (showName: string) => {
    const patch = editProfile[showName]
    if (!patch) return
    setSaving(`profile_${showName}`)
    await supabase.from('nova_style_profile').update({ ...patch, updated_at: new Date().toISOString() }).eq('show_name', showName)
    setSaved(`profile_${showName}`); setTimeout(() => setSaved(null), 2000)
    setSaving(null)
  }

  const updateConfig = (showName: string, field: string, value: string) => {
    setEditConfig(prev => ({ ...prev, [showName]: { ...prev[showName], [field]: value } }))
  }
  const updateProfile = (showName: string, field: string, value: string | string[]) => {
    setEditProfile(prev => ({ ...prev, [showName]: { ...prev[showName], [field]: value } }))
  }
  const getConfig = (show: ShowConfig, field: keyof ShowConfig): string =>
    String(editConfig[show.show_name]?.[field] ?? show[field] ?? '')
  const getProfile = (profile: NovaStyleProfile, field: keyof NovaStyleProfile): string => {
    const val = editProfile[profile.show_name]?.[field] ?? profile[field]
    if (Array.isArray(val)) return val.join('\n')
    return String(val ?? '')
  }

  const TABS = [
    { key: 'shows' as Tab,  label: 'Show Config',    icon: Settings2 },
    { key: 'style' as Tab,  label: 'Style Profiles', icon: Brain     },
    { key: 'canva' as Tab,  label: 'Canva Templates',icon: Palette   },
  ]

  // Canva templates from nova_integrations
  const canvaTemplates = integrations.filter(i => i.key.startsWith('canva_template_'))
  const driveLinks = integrations.filter(i => i.key.startsWith('gdrive_'))
  const showForTemplate = (key: string) => key.replace('canva_template_', '').replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <GuestGate pageName="Settings">
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
          <Settings2 size={28} className="text-nova-gold" /> SETTINGS
        </h1>
        <p className="text-sm font-mono text-nova-muted mt-1">Configure NOVA — shows, AI style, Canva templates, API keys</p>
      </div>

      <div className="flex items-center gap-1 border-b border-nova-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-body border-b-2 -mb-px transition-all ${
              tab === key ? 'border-nova-gold text-nova-gold' : 'border-transparent text-nova-muted hover:text-white'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-nova-muted text-sm py-8">
          <Loader2 size={14} className="animate-spin" /> Loading settings...
        </div>
      ) : (
        <>
          {/* Show Config */}
          {tab === 'shows' && (
            <div className="space-y-4">
              {shows.map(show => {
                const color = SHOW_COLORS[show.show_name] ?? '#C9A84C'
                const isDirty = Boolean(editConfig[show.show_name])
                return (
                  <div key={show.show_name} className="nova-card">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <h3 className="font-display text-white">{show.display_name}</h3>
                      <span className="text-xs font-mono text-nova-muted ml-auto">{show.show_name}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">HeyGen Avatar ID</label>
                        <input value={getConfig(show, 'avatar_id')}
                          onChange={e => updateConfig(show.show_name, 'avatar_id', e.target.value)}
                          className="nova-input w-full" placeholder="avatar_id from app.heygen.com/avatars" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">HeyGen Voice ID</label>
                        <input value={getConfig(show, 'heygen_voice_id')}
                          onChange={e => updateConfig(show.show_name, 'heygen_voice_id', e.target.value)}
                          className="nova-input w-full" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">Background URL</label>
                        <input value={getConfig(show, 'background_url')}
                          onChange={e => updateConfig(show.show_name, 'background_url', e.target.value)}
                          className="nova-input w-full" placeholder="https://... or blank for solid color" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">Brand Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={getConfig(show, 'color') || color}
                            onChange={e => updateConfig(show.show_name, 'color', e.target.value)}
                            className="w-10 h-9 rounded-lg border border-nova-border cursor-pointer bg-transparent" />
                          <input value={getConfig(show, 'color') || color}
                            onChange={e => updateConfig(show.show_name, 'color', e.target.value)}
                            className="nova-input flex-1" />
                        </div>
                      </div>
                    </div>
                    {isDirty && (
                      <button onClick={() => saveShow(show.show_name)} disabled={saving === show.show_name}
                        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-gold text-nova-navy text-sm font-body hover:bg-nova-gold/80 transition-all disabled:opacity-50">
                        {saving === show.show_name ? <><Loader2 size={13} className="animate-spin" /> Saving...</>
                          : saved === show.show_name ? <><Check size={13} /> Saved!</>
                          : <><Save size={13} /> Save Changes</>}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Style Profiles */}
          {tab === 'style' && (
            <div className="space-y-4">
              <div className="nova-card border border-nova-violet/30">
                <div className="flex items-center gap-2 mb-2">
                  <Info size={14} className="text-nova-violet" />
                  <span className="text-xs font-mono text-nova-violet">How Style Profiles Work</span>
                </div>
                <p className="text-xs font-mono text-nova-muted leading-relaxed">
                  NOVA Brain reads your style profile before generating any content. Every word, tone tag, and hook
                  pattern trains Claude to write exactly like <strong className="text-white">you</strong>.
                  More detail = more authentic output.
                </p>
              </div>
              {profiles.map(profile => {
                const isDirty = Boolean(editProfile[profile.show_name])
                const color = SHOW_COLORS[profile.show_name] ?? '#C9A84C'
                return (
                  <div key={profile.show_name} className="nova-card">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <h3 className="font-display text-white">
                        {profile.show_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">AI Style Prompt — Claude reads this for every content generation</label>
                        <textarea value={getProfile(profile, 'style_prompt')}
                          onChange={e => updateProfile(profile.show_name, 'style_prompt', e.target.value)}
                          className="nova-input w-full h-28 resize-none text-xs" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-mono text-nova-muted mb-1">Tone Tags (one per line)</label>
                          <textarea value={getProfile(profile, 'tone_tags')}
                            onChange={e => updateProfile(profile.show_name, 'tone_tags', e.target.value.split('\n'))}
                            className="nova-input w-full h-20 resize-none text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-nova-muted mb-1">Content Pillars (one per line)</label>
                          <textarea value={getProfile(profile, 'content_pillars')}
                            onChange={e => updateProfile(profile.show_name, 'content_pillars', e.target.value.split('\n'))}
                            className="nova-input w-full h-20 resize-none text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-nova-muted mb-1">Power Vocabulary (one per line)</label>
                          <textarea value={getProfile(profile, 'vocabulary')}
                            onChange={e => updateProfile(profile.show_name, 'vocabulary', e.target.value.split('\n'))}
                            className="nova-input w-full h-20 resize-none text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-nova-muted mb-1">Words to NEVER Use (one per line)</label>
                          <textarea value={getProfile(profile, 'avoid_words')}
                            onChange={e => updateProfile(profile.show_name, 'avoid_words', e.target.value.split('\n'))}
                            className="nova-input w-full h-20 resize-none text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">Hook Patterns (one per line)</label>
                        <textarea value={getProfile(profile, 'hook_patterns')}
                          onChange={e => updateProfile(profile.show_name, 'hook_patterns', e.target.value.split('\n'))}
                          className="nova-input w-full h-24 resize-none text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">CTA Patterns (one per line)</label>
                        <textarea value={getProfile(profile, 'cta_patterns')}
                          onChange={e => updateProfile(profile.show_name, 'cta_patterns', e.target.value.split('\n'))}
                          className="nova-input w-full h-20 resize-none text-xs" />
                      </div>
                    </div>
                    {isDirty && (
                      <button onClick={() => saveProfile(profile.show_name)} disabled={saving === `profile_${profile.show_name}`}
                        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-nova-violet text-white text-sm font-body hover:bg-nova-violet/80 transition-all disabled:opacity-50">
                        {saving === `profile_${profile.show_name}` ? <><Loader2 size={13} className="animate-spin" /> Saving...</>
                          : saved === `profile_${profile.show_name}` ? <><Check size={13} /> Saved!</>
                          : <><Save size={13} /> Save Style Profile</>}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Canva Templates */}
          {tab === 'canva' && (
            <div className="space-y-4">
              <div className="nova-card border border-[#7B2ABF]/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Palette size={14} style={{ color: '#A855F7' }} />
                    <h3 className="font-display" style={{ color: '#A855F7' }}>Canva Templates</h3>
                  </div>
                  <button onClick={connectCanva} disabled={canvaConnecting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-body transition-all disabled:opacity-50"
                    style={{ backgroundColor: '#7B2ABF' }}>
                    {canvaConnecting
                      ? <><Loader2 size={13} className="animate-spin" /> Connecting...</>
                      : <><Link2 size={13} /> Connect Canva</>}
                  </button>
                </div>
                {canvaMsg && (
                  <p className={`text-xs font-mono mb-3 ${canvaMsg.startsWith('Error') ? 'text-nova-crimson' : 'text-nova-teal'}`}>
                    {canvaMsg}
                  </p>
                )}
                <p className="text-xs font-mono text-nova-muted mb-4 leading-relaxed">
                  Branded Canva thumbnail templates for each show. These are pre-built with Tea Time Network
                  brand colors. Open in Canva to customize, then export and use for your episodes.
                  NOVA Image generates the fal.ai base image — Canva overlays your branding.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {canvaTemplates.map(t => {
                    const showName = t.key.replace('canva_template_', '')
                    const color = SHOW_COLORS[showName] ?? '#C9A84C'
                    return (
                      <div key={t.key} className="flex items-center gap-3 p-3 rounded-xl border border-nova-border/50">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-body text-white">{showForTemplate(t.key)}</p>
                          <p className="text-[10px] font-mono text-nova-muted truncate">{t.description}</p>
                        </div>
                        <a href={t.value} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded-lg text-white transition-all flex-shrink-0"
                          style={{ backgroundColor: '#7B2ABF' }}>
                          Edit <ExternalLink size={10} />
                        </a>
                      </div>
                    )
                  })}
                  {canvaTemplates.length === 0 && (
                    <p className="text-sm font-mono text-nova-muted col-span-2">
                      No templates stored yet. Generate thumbnails via Content Studio to create them.
                    </p>
                  )}
                </div>
              </div>

              {driveLinks.length > 0 && (
                <div className="nova-card">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={14} className="text-nova-teal" />
                    <h3 className="font-display text-nova-teal text-base">Google Drive Archive</h3>
                  </div>
                  <div className="space-y-2">
                    {driveLinks.filter(d => d.key === 'gdrive_root_folder_id' || d.key === 'gdrive_tracker_id').map(d => (
                      <div key={d.key} className="flex items-center gap-3 p-2 rounded-lg border border-nova-border/30">
                        <p className="text-xs font-mono text-nova-muted flex-1">{d.description}</p>
                        <a href={d.key === 'gdrive_tracker_id'
                          ? `https://docs.google.com/spreadsheets/d/${d.value}`
                          : `https://drive.google.com/drive/folders/${d.value}`}
                          target="_blank" rel="noreferrer"
                          className="text-xs font-mono text-nova-teal hover:underline flex items-center gap-1">
                          Open <ExternalLink size={10} />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </>
      )}
    </div>
    </GuestGate>
  )
}