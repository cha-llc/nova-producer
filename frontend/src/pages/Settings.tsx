import { useEffect, useState, useCallback } from 'react'
import { Settings2, Save, Loader2, Check, Key, ExternalLink, Info, BookOpen, Brain, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ShowConfig, NovaStyleProfile } from '../types'

const SHOW_COLORS: Record<string, string> = {
  sunday_power_hour: '#C9A84C',
  motivation_court:  '#2A9D8F',
  tea_time_with_cj:  '#9B5DE5',
  confession_court:  '#C1121F',
}

type Tab = 'shows' | 'style' | 'voice' | 'apis'

export default function Settings() {
  const [shows, setShows]       = useState<ShowConfig[]>([])
  const [profiles, setProfiles] = useState<NovaStyleProfile[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [saved, setSaved]       = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>('shows')
  const [editConfig, setEditConfig]   = useState<Record<string, Partial<ShowConfig>>>({})
  const [editProfile, setEditProfile] = useState<Record<string, Partial<NovaStyleProfile>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: showData }, { data: profileData }] = await Promise.all([
      supabase.from('show_configs').select('*').order('display_name'),
      supabase.from('nova_style_profile').select('*').order('show_name'),
    ])
    setShows(showData ?? [])
    setProfiles(profileData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveShow = async (showName: string) => {
    const patch = editConfig[showName]
    if (!patch) return
    setSaving(showName)
    await supabase.from('show_configs').update(patch).eq('show_name', showName)
    setSaved(showName)
    setTimeout(() => setSaved(null), 2000)
    setSaving(null)
    load()
  }

  const saveProfile = async (showName: string) => {
    const patch = editProfile[showName]
    if (!patch) return
    setSaving(`profile_${showName}`)
    await supabase.from('nova_style_profile')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('show_name', showName)
    setSaved(`profile_${showName}`)
    setTimeout(() => setSaved(null), 2000)
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

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'shows',  label: 'Show Config',    icon: Settings2 },
    { key: 'style',  label: 'Style Profiles', icon: Brain     },
    { key: 'voice',  label: 'Voice & Avatar', icon: Mic       },
    { key: 'apis',   label: 'API Keys',       icon: Key       },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl text-white tracking-wide flex items-center gap-3">
          <Settings2 size={28} className="text-nova-gold" /> SETTINGS
        </h1>
        <p className="text-sm font-mono text-nova-muted mt-1">Configure NOVA — shows, AI style, voice, and API keys</p>
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
                          className="nova-input w-full" placeholder="voice_id from HeyGen" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-nova-muted mb-1">Background URL</label>
                        <input value={getConfig(show, 'background_url')}
                          onChange={e => updateConfig(show.show_name, 'background_url', e.target.value)}
                          className="nova-input w-full" placeholder="https://... or leave blank for solid color" />
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
                        {saving === show.show_name ? <><Loader2 size={13} className="animate-spin" /> Saving...</> :
                         saved === show.show_name  ? <><Check size={13} /> Saved!</> :
                                                     <><Save size={13} /> Save Changes</>}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'style' && (
            <div className="space-y-4">
              <div className="nova-card border border-nova-violet/30">
                <div className="flex items-center gap-2 mb-2">
                  <Info size={14} className="text-nova-violet" />
                  <span className="text-xs font-mono text-nova-violet">How Style Profiles Work</span>
                </div>
                <p className="text-xs font-mono text-nova-muted leading-relaxed">
                  NOVA Brain reads your style profile before generating any content. The style prompt, vocabulary,
                  hooks, and CTAs train NOVA to sound like <strong className="text-white">you</strong>.
                  Add sample scripts from your best-performing content to improve accuracy over time.
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
                        <label className="block text-xs font-mono text-nova-muted mb-1">AI Style Prompt — main voice instruction for Claude</label>
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
                        {saving === `profile_${profile.show_name}` ? <><Loader2 size={13} className="animate-spin" /> Saving...</> :
                         saved  === `profile_${profile.show_name}` ? <><Check size={13} /> Saved!</> :
                                                                     <><Save size={13} /> Save Style Profile</>}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'apis' && (
            <div className="space-y-4">
              <div className="nova-card border border-nova-gold/30">
                <div className="flex items-center gap-2 mb-3">
                  <Key size={14} className="text-nova-gold" />
                  <h3 className="font-display text-nova-gold">API Key Setup</h3>
                </div>
                <p className="text-xs font-mono text-nova-muted mb-4 leading-relaxed">
                  API keys are stored securely in Supabase Edge Function Secrets.
                  Add them via: <strong className="text-white">Supabase Dashboard &rarr; Edge Functions &rarr; Secrets</strong>
                </p>
                <div className="space-y-3">
                  {[
                    { name: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude AI)', desc: 'Powers NOVA Brain — content generation, style matching, hooks, captions. Required for Studio.', link: 'https://console.anthropic.com/keys', status: 'required' },
                    { name: 'FAL_API_KEY', label: 'fal.ai (Image Generation)', desc: 'Generates AI thumbnails and social cards for every episode. Free credits available.', link: 'https://fal.ai/dashboard/keys', status: 'optional' },
                    { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs (Voice)', desc: 'Already configured. Powers TTS and voice cloning. Upgrade to Professional for best clones.', link: 'https://elevenlabs.io/docs', status: 'configured' },
                    { name: 'HEYGEN_API_KEY', label: 'HeyGen (Video)', desc: 'Already configured via Supabase Vault. Update in vault.secrets if it expires.', link: 'https://app.heygen.com/settings', status: 'configured' },
                    { name: 'SOCIALBLU_API_KEY', label: 'Socialblu (Social)', desc: 'Already configured. Posts to TikTok, IG, YouTube, Pinterest, LinkedIn, Twitter.', link: 'https://app.socialblu.io', status: 'configured' },
                  ].map(api => (
                    <div key={api.name} className="flex items-start gap-4 p-3 rounded-xl border border-nova-border/50">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        api.status === 'configured' ? 'bg-nova-teal' :
                        api.status === 'required'   ? 'bg-nova-crimson animate-pulse' : 'bg-nova-gold/60'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono text-nova-gold">{api.name}</code>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                            api.status === 'configured' ? 'bg-nova-teal/15 text-nova-teal' :
                            api.status === 'required'   ? 'bg-nova-crimson/15 text-nova-crimson' : 'bg-nova-gold/15 text-nova-gold'
                          }`}>{api.status}</span>
                          <span className="text-xs font-mono text-white">{api.label}</span>
                        </div>
                        <p className="text-xs font-mono text-nova-muted mt-1 leading-relaxed">{api.desc}</p>
                      </div>
                      <a href={api.link} target="_blank" rel="noreferrer"
                        className="text-nova-muted hover:text-nova-gold transition-colors flex-shrink-0">
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'voice' && (
            <div className="space-y-4">
              <div className="nova-card">
                <h3 className="font-display text-white mb-3 flex items-center gap-2">
                  <Mic size={15} className="text-nova-teal" /> Voice and Avatar Setup
                </h3>
                <p className="text-xs font-mono text-nova-muted mb-4">
                  Manage voices in the <strong className="text-white">Voice Studio</strong> page.
                  Configure avatar IDs and voice assignments per show in the <strong className="text-white">Show Config</strong> tab.
                </p>
                <div className="space-y-3 text-sm font-mono text-nova-muted">
                  <p className="flex items-center gap-2">
                    <BookOpen size={13} />
                    <strong className="text-white">Voice Clone:</strong> Voice Studio &rarr; Clone Your Voice &rarr; Upload 3-5 audio samples
                  </p>
                  <p className="flex items-center gap-2">
                    <BookOpen size={13} />
                    <strong className="text-white">Avatar ID:</strong> app.heygen.com &rarr; Avatars &rarr; Copy the base Avatar ID
                  </p>
                  <p className="flex items-center gap-2">
                    <BookOpen size={13} />
                    <strong className="text-white">Assign to Show:</strong> Voice Studio &rarr; Assign Voice to Show
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
