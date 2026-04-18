import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, TrendingUp, Video, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ShowCard from '../components/ShowCard'
import type { ShowConfig, AiEpisode } from '../types'

interface Stats { scripts: number; episodes: number; done: number; failed: number }

export default function Dashboard() {
  const navigate = useNavigate()
  const [shows, setShows]     = useState<ShowConfig[]>([])
  const [recentEps, setRecent] = useState<AiEpisode[]>([])
  const [showStats, setShowStats] = useState<Record<string, { scripts: number; episodes: number }>>({})
  const [totals, setTotals]   = useState<Stats>({ scripts: 0, episodes: 0, done: 0, failed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [showsRes, scriptsRes, recentRes, totalEpsRes] = await Promise.all([
        supabase.from('show_configs').select('*').order('display_name'),
        supabase.from('show_scripts').select('id, show_id, status'),
        // Recent episodes for the display cards (limit 4)
        supabase.from('ai_episodes').select('*').order('created_at', { ascending: false }).limit(4),
        // Separate unrestricted count for accurate stats
        supabase.from('ai_episodes').select('id, show_name, status'),
      ])

      const s       = showsRes.data ?? []
      const scripts = scriptsRes.data ?? []
      const recent  = recentRes.data ?? []
      const allEps  = totalEpsRes.data ?? []

      setShows(s)
      setRecent(recent)

      // Stats per show use all episodes (not just recent 4)
      const byShow: Record<string, { scripts: number; episodes: number }> = {}
      for (const show of s) {
        byShow[show.id] = {
          scripts:  scripts.filter(sc => sc.show_id === show.id).length,
          episodes: allEps.filter(ep => ep.show_name === show.show_name).length,
        }
      }
      setShowStats(byShow)

      setTotals({
        scripts:  scripts.length,
        episodes: allEps.length,
        done:     allEps.filter(e => e.status === 'complete').length,
        failed:   allEps.filter(e => e.status === 'failed').length,
      })

      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-nova-border bg-nova-surface p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-nova-gold/5 via-transparent to-nova-violet/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-nova-teal animate-pulse-slow" />
            <span className="text-xs font-mono text-nova-teal uppercase tracking-widest">System Online</span>
          </div>
          <h1 className="font-display text-4xl text-white tracking-widest mb-2">NOVA</h1>
          <p className="font-body text-nova-muted text-sm max-w-md">
            Network Output &amp; Voice Automator. Your AI co-host for Tea Time Network — 
            producing all four shows in your voice, automatically.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Scripts',  value: totals.scripts,  icon: FileText,    color: 'text-nova-gold' },
          { label: 'Episodes Made',  value: totals.episodes, icon: Video,       color: 'text-nova-teal' },
          { label: 'Published',      value: totals.done,     icon: TrendingUp,  color: 'text-green-400' },
          { label: 'Failed',         value: totals.failed,   icon: Zap,         color: 'text-nova-crimson' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="nova-card">
            <Icon size={16} className={`${color} mb-2`} />
            <div className={`font-display text-3xl tracking-wide ${color}`}>{value}</div>
            <div className="text-xs font-mono text-nova-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Shows */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-white text-2xl tracking-wide">Shows</h2>
          <button onClick={() => navigate('/scripts')} className="nova-btn-ghost text-xs">
            + New Script
          </button>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="nova-card h-44 animate-pulse bg-nova-border/20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {shows.map(show => (
              <ShowCard
                key={show.id}
                show={show}
                scriptCount={showStats[show.id]?.scripts ?? 0}
                episodeCount={showStats[show.id]?.episodes ?? 0}
                onClick={() => navigate(`/scripts?show=${show.show_name}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent episodes */}
      {recentEps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-white text-2xl tracking-wide">Recent Episodes</h2>
            <button onClick={() => navigate('/episodes')} className="nova-btn-ghost text-xs">
              View All
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentEps.map(ep => (
              <div key={ep.id} className="nova-card">
                <div className="text-xs font-mono text-nova-muted capitalize mb-1">
                  {ep.show_name.replace(/_/g, ' ')}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    ep.status === 'complete' ? 'bg-green-400' :
                    ep.status === 'generating' ? 'bg-nova-gold animate-pulse' : 'bg-nova-crimson'
                  }`} />
                  <span className="text-sm font-body text-white capitalize">{ep.status}</span>
                </div>
                <div className="text-xs font-mono text-nova-muted mt-2">
                  {new Date(ep.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
