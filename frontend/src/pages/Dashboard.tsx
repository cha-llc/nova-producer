import { useEffect, useState, useCallback } from 'react'
import { Radio, FileText, Video, Brain, Mic, Sparkles, TrendingUp,
         CheckCircle, Loader2, AlertCircle, RefreshCw, ArrowRight, Palette, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { NavLink } from 'react-router-dom'
import type { NovaSocialContent } from '../types'

interface Stats {
  total_episodes: number; complete_episodes: number; generating_episodes: number
  total_scripts: number; ready_scripts: number; done_scripts: number
  social_complete: number; voice_clones: number
  shows: Array<{ show_name: string; display_name: string; color: string }>
}
const EMPTY: Stats = {
  total_episodes: 0, complete_episodes: 0, generating_episodes: 0,
  total_scripts: 0, ready_scripts: 0, done_scripts: 0,
  social_complete: 0, voice_clones: 0, shows: [],
}

const SHOW_COLORS: Record<string, string> = {
  sunday_power_hour: '#C9A84C',
  motivation_court:  '#2A9D8F',
  tea_time_with_cj:  '#9B5DE5',
  confession_court:  '#C1121F',
}

export default function Dashboard() {
  const isGuest = !!localStorage.getItem('nova_guest_token')
  const guestName = localStorage.getItem('nova_guest_name') || 'Guest'

  const [stats, setStats]     = useState<Stats>(EMPTY)
  const [loading, setLoading] = useState(!isGuest)
  const [recentEps, setRecentEps] = useState<Array<{
    id: string; show_name: string; episode_title: string; heygen_title: string
    status: string; storage_url: string; thumbnail_url: string; created_at: string
    social_content_id: string | null
  }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [
      { count: totalEps }, { count: completeEps }, { count: genEps },
      { count: totalScripts }, { count: readyScripts }, { count: doneScripts },
      { count: socialDone }, { count: voiceClones },
      { data: shows }, { data: recentData },
    ] = await Promise.all([
      supabase.from('ai_episodes').select('id', { count: 'exact', head: true }),
      supabase.from('ai_episodes').select('id', { count: 'exact', head: true }).eq('status', 'complete'),
      supabase.from('ai_episodes').select('id', { count: 'exact', head: true }).eq('status', 'generating'),
      supabase.from('show_scripts').select('id', { count: 'exact', head: true }),
      supabase.from('show_scripts').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
      supabase.from('show_scripts').select('id', { count: 'exact', head: true }).eq('status', 'done'),
      supabase.from('nova_social_content').select('id', { count: 'exact', head: true }).eq('status', 'complete'),
      supabase.from('nova_voice_clones').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('show_configs').select('show_name, display_name, color'),
      supabase.from('ai_episodes')
        .select('id,show_name,episode_title,heygen_title,status,storage_url,thumbnail_url,created_at,social_content_id')
        .order('created_at', { ascending: false }).limit(6),
    ])
    setStats({
      total_episodes: totalEps ?? 0, complete_episodes: completeEps ?? 0,
      generating_episodes: genEps ?? 0, total_scripts: totalScripts ?? 0,
      ready_scripts: readyScripts ?? 0, done_scripts: doneScripts ?? 0,
      social_complete: socialDone ?? 0, voice_clones: voiceClones ?? 0,
      shows: (shows ?? []).map(s => ({ ...s })),
    })
    setRecentEps(recentData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isGuest) return
    load()
    // Realtime: refresh stats when episodes change
    const ch = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_episodes' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, isGuest])

  const topCards = [
    { label: 'Episodes Published', value: stats.complete_episodes,  color: '#2A9D8F', sub: `${stats.total_episodes} total` },
    { label: 'Scripts Ready',      value: stats.ready_scripts,      color: '#C9A84C', sub: `${stats.done_scripts} published` },
    { label: 'AI Content Sets',    value: stats.social_complete,    color: '#9B5DE5', sub: 'Studio outputs' },
    { label: 'Voice Clones',       value: stats.voice_clones,       color: '#2A9D8F', sub: 'ElevenLabs clones' },
  ]

  const quickLinks = [
    { to: '/scripts',  label: 'Write Scripts',   desc: 'Queue content for NOVA',   color: '#C9A84C', icon: FileText },
    { to: '/episodes', label: 'Episodes',         desc: 'All produced videos',       color: '#2A9D8F', icon: Video    },
    { to: '/studio',   label: 'Content Studio',   desc: 'AI captions + hooks',       color: '#9B5DE5', icon: Brain    },
    { to: '/voice',    label: 'Voice Studio',     desc: 'Clone your voice',          color: '#2A9D8F', icon: Mic      },
    { to: '/settings', label: 'Canva Templates',  desc: 'Branded thumbnails',        color: '#A855F7', icon: Palette  },
  ]

  // ── GUEST VIEW ─────────────────────────────────────────────────────────────
  if (isGuest) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-nova-teal animate-pulse-slow" />
              <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Guest Access Portal</span>
            </div>
            <h1 className="font-display text-4xl text-white tracking-wide">Welcome, {guestName}</h1>
            <p className="text-sm font-mono text-nova-muted mt-1">
              Your NOVA guest workspace — explore available features below
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Episodes', sub: 'Your produced videos', color: '#2A9D8F' },
            { label: 'Scripts', sub: 'Your content queue', color: '#C9A84C' },
            { label: 'AI Content', sub: 'Studio outputs', color: '#9B5DE5' },
            { label: 'Voice Clones', sub: 'ElevenLabs clones', color: '#2A9D8F' },
          ].map(({ label, sub, color }) => (
            <div key={label} className="nova-card flex flex-col gap-2 opacity-50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-mono text-nova-muted">{label}</span>
              </div>
              <div className="flex items-end gap-2">
                <Lock size={18} className="text-nova-muted" />
              </div>
              <p className="text-xs font-mono text-nova-muted">{sub}</p>
            </div>
          ))}
        </div>
        <div className="nova-card border border-nova-gold/30">
          <div className="flex items-start gap-3">
            <Sparkles size={16} className="text-nova-gold flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-body text-white mb-1">Guest Access Active</p>
              <p className="text-xs font-mono text-nova-muted">
                You have read access to NOVA. Full production features require a Pro subscription.
                Your data is isolated — only you can see your content.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── OWNER VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-nova-teal animate-pulse-slow" />
            <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Network Output and Voice Automator</span>
          </div>
          <h1 className="font-display text-4xl text-white tracking-wide">NOVA v2</h1>
          <p className="text-sm font-mono text-nova-muted mt-1">
            Claude + fal.ai + Canva + HeyGen + ElevenLabs + Socialblu — all in one pipeline
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="nova-btn-ghost flex items-center gap-2 text-sm disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {topCards.map(({ label, value, color, sub }) => (
          <div key={label} className="nova-card flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-mono text-nova-muted">{label}</span>
            </div>
            <div className="flex items-end gap-2">
              {loading
                ? <Loader2 size={20} className="animate-spin text-nova-muted" />
                : <span className="font-display text-3xl text-white">{value}</span>}
            </div>
            <p className="text-xs font-mono text-nova-muted">{sub}</p>
          </div>
        ))}
      </div>

      {/* Generating live indicator */}
      {stats.generating_episodes > 0 && (
        <div className="nova-card border border-nova-gold/30 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-nova-gold flex-shrink-0" />
          <div>
            <p className="text-sm font-body text-white">
              {stats.generating_episodes} episode{stats.generating_episodes > 1 ? 's' : ''} rendering now
            </p>
            <p className="text-xs font-mono text-nova-muted">nova-poll checks every 2 min and auto-publishes</p>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div>
        <p className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-3">Quick Access</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {quickLinks.map(({ to, label, icon: Icon, color, desc }) => (
            <NavLink key={to} to={to}
              className="nova-card flex flex-col gap-2 hover:opacity-80 transition-all group">
              <Icon size={18} style={{ color }} />
              <div>
                <p className="text-sm font-body text-white group-hover:text-nova-gold transition-colors">{label}</p>
                <p className="text-xs font-mono text-nova-muted">{desc}</p>
              </div>
              <ArrowRight size={13} className="text-nova-muted/40 group-hover:text-nova-gold transition-colors mt-auto" />
            </NavLink>
          ))}
        </div>
      </div>

      {/* Recent episodes */}
      {recentEps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-nova-muted uppercase tracking-widest flex items-center gap-2">
              <Sparkles size={11} /> Recent Episodes
            </p>
            <NavLink to="/episodes" className="text-xs font-mono text-nova-muted hover:text-nova-gold transition-colors flex items-center gap-1">
              View all <ArrowRight size={11} />
            </NavLink>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {recentEps.map(ep => {
              const color = SHOW_COLORS[ep.show_name] ?? '#C9A84C'
              const title = ep.episode_title || ep.heygen_title || 'Untitled'
              return (
                <div key={ep.id} className="nova-card group overflow-hidden p-0">
                  {ep.thumbnail_url ? (
                    <div className="relative h-24 overflow-hidden">
                      <img src={ep.thumbnail_url} alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-gradient-to-t from-nova-navydark/80 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs font-body text-white line-clamp-1">{title}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                      <Radio size={24} style={{ color }} className="opacity-40" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${color}18`, color }}>
                        {ep.show_name.split('_')[0]}
                      </span>
                      <div className="flex items-center gap-1">
                        {ep.social_content_id && <Sparkles size={9} className="text-nova-violet" />}
                        {ep.status === 'complete'   && <CheckCircle size={11} className="text-nova-teal" />}
                        {ep.status === 'generating' && <Loader2 size={11} className="animate-spin text-nova-gold" />}
                        {ep.status === 'failed'     && <AlertCircle size={11} className="text-nova-crimson" />}
                      </div>
                    </div>
                    {ep.storage_url && ep.status === 'complete' && (
                      <a href={ep.storage_url} target="_blank" rel="noreferrer"
                        className="mt-2 flex items-center gap-1 text-[10px] font-mono text-nova-muted hover:text-nova-gold transition-colors">
                        <TrendingUp size={9} /> Watch
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Shows */}
      {stats.shows.length > 0 && (
        <div>
          <p className="text-xs font-mono text-nova-muted uppercase tracking-widest mb-3">Shows</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.shows.map(show => {
              const color = show.color || SHOW_COLORS[show.show_name] || '#C9A84C'
              return (
                <div key={show.show_name} className="nova-card">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs font-mono text-white">{show.display_name}</span>
                  </div>
                  <p className="text-[10px] font-mono text-nova-muted">{show.show_name}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
