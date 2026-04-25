import GuestGate from '../components/GuestGate'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Send, Check, AlertCircle, Clock, RefreshCw, Trash2, X, Wifi, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

type PostStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'

interface QueuePost {
  id: string; episode_id: string | null; episode_title: string; show_name: string
  account_ids: number[]; scheduled_at: string; status: PostStatus
  hook: string; caption: string; cta: string; hashtags: string[]
  video_url: string; error_msg: string | null; socialblu_post_ids: unknown[]
  sent_at: string | null; created_at: string
}

const PLATFORMS: Record<number, { name: string; emoji: string }> = {
  165296: { name: 'TikTok',     emoji: '🎬' },
  165297: { name: 'Instagram',  emoji: '📸' },
  165298: { name: 'YouTube',    emoji: '▶️' },
  177489: { name: 'Pinterest',  emoji: '📌' },
  177779: { name: 'Reddit',     emoji: '👽' },
  177890: { name: 'X',          emoji: '𝕏'  },
  177891: { name: 'LinkedIn',   emoji: '💼' },
}

const STATUS_STYLE: Record<string, string> = {
  sent:       'bg-nova-teal/10 border-nova-teal/30 text-nova-teal',
  pending:    'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  processing: 'bg-blue-500/10  border-blue-500/30  text-blue-400',
  failed:     'bg-red-500/10   border-red-500/30   text-red-400',
  cancelled:  'bg-nova-border/50 border-nova-border text-nova-muted',
}

export default function Scheduler() {
  const [posts, setPosts]           = useState<QueuePost[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [liveConnected, setLiveConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const { data } = await supabase
        .from('nova_post_queue')
        .select('*')
        .order('scheduled_at', { ascending: false })
        .limit(80)
      setPosts((data ?? []) as QueuePost[])
      setLastUpdated(new Date())
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  // Supabase realtime subscription on nova_post_queue
  useEffect(() => {
    load()

    const channel = supabase
      .channel('scheduler-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nova_post_queue' },
        (payload) => {
          // On any INSERT / UPDATE / DELETE — patch local state without full reload
          if (payload.eventType === 'INSERT') {
            setPosts(prev => [payload.new as QueuePost, ...prev].slice(0, 80))
            setLastUpdated(new Date())
          } else if (payload.eventType === 'UPDATE') {
            setPosts(prev => prev.map(p => p.id === (payload.new as QueuePost).id ? payload.new as QueuePost : p))
            setLastUpdated(new Date())
          } else if (payload.eventType === 'DELETE') {
            setPosts(prev => prev.filter(p => p.id !== (payload.old as QueuePost).id))
            setLastUpdated(new Date())
          }
        }
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    // Fallback poll every 30s in case realtime drops
    const t = setInterval(() => load(true), 30000)

    return () => {
      clearInterval(t)
      supabase.removeChannel(channel)
    }
  }, [load])

  const deletePost = async (id: string) => {
    setDeleting(id); setConfirmDelete(null)
    await supabase.from('nova_post_queue').delete().eq('id', id)
    setPosts(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  const stats = posts.reduce(
    (acc, p) => {
      if (p.status === 'sent')    acc.sent++
      if (p.status === 'pending') acc.pending++
      if (p.status === 'failed')  acc.failed++
      return acc
    },
    { sent: 0, pending: 0, failed: 0 }
  )

  return (
    <GuestGate pageName="Scheduler">
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-nova-teal animate-pulse-slow" />
            <span className="text-xs font-mono text-nova-muted uppercase tracking-widest">Post Scheduler</span>
          </div>
          <h1 className="font-display text-3xl text-white tracking-wide">POST SCHEDULER</h1>
          <p className="text-sm font-mono text-nova-muted mt-0.5">Track and manage queued posts via Socialblu</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono ${
            liveConnected
              ? 'border-nova-teal/30 bg-nova-teal/10 text-nova-teal'
              : 'border-nova-border/40 text-nova-muted'
          }`}>
            {liveConnected
              ? <><Wifi size={10} className="animate-pulse" /> LIVE</>
              : <><WifiOff size={10} /> POLLING</>
            }
          </div>
          {lastUpdated && (
            <span className="text-[10px] font-mono text-nova-muted hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => load()} disabled={refreshing}
            className="nova-btn-ghost flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'SENT',    count: stats.sent,    icon: <Check size={15}/>,        cls: 'text-nova-teal' },
          { label: 'PENDING', count: stats.pending, icon: <Clock size={15}/>,        cls: 'text-yellow-400' },
          { label: 'FAILED',  count: stats.failed,  icon: <AlertCircle size={15}/>,  cls: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="nova-card flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-nova-muted uppercase tracking-widest">{s.label}</span>
              <span className={s.cls}>{s.icon}</span>
            </div>
            <p className={`text-3xl font-display ${s.cls}`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Posts */}
      {loading && posts.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-nova-gold" />
        </div>
      ) : posts.length === 0 ? (
        <div className="nova-card text-center py-16">
          <Send size={20} className="mx-auto mb-3 text-nova-muted opacity-40" />
          <p className="text-sm font-mono text-nova-muted">No posts in queue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const isConfirming = confirmDelete === post.id
            const isDeleting   = deleting === post.id
            const canDelete    = ['pending', 'failed', 'cancelled'].includes(post.status)
            const isOverdue    = post.status === 'pending' && new Date(post.scheduled_at) < new Date()

            return (
              <div key={post.id} className={`nova-card group transition-all ${isOverdue ? 'border-orange-500/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-body font-semibold text-white truncate">{post.episode_title || post.show_name}</p>
                    <p className="text-[11px] font-mono text-nova-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>📺 {post.show_name.replace(/_/g, ' ').toUpperCase()}</span>
                      <span>·</span>
                      <span className={isOverdue ? 'text-orange-400' : ''}>
                        🕐 {new Date(post.scheduled_at).toLocaleString()}
                        {isOverdue && ' ⚠️ overdue'}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-1 rounded border text-[10px] font-mono flex items-center gap-1 ${STATUS_STYLE[post.status] ?? STATUS_STYLE.cancelled}`}>
                      {post.status === 'sent'       && <Check size={10} />}
                      {post.status === 'pending'    && <Clock size={10} />}
                      {post.status === 'processing' && <RefreshCw size={10} className="animate-spin" />}
                      {post.status === 'failed'     && <AlertCircle size={10} />}
                      {post.status.toUpperCase()}
                    </span>
                    {canDelete && !isConfirming && !isDeleting && (
                      <button onClick={() => setConfirmDelete(post.id)}
                        className="nova-btn-ghost p-1.5 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    )}
                    {isDeleting && <RefreshCw size={13} className="animate-spin text-nova-muted" />}
                    {isConfirming && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-red-400">Delete?</span>
                        <button onClick={() => deletePost(post.id)}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">Yes</button>
                        <button onClick={() => setConfirmDelete(null)} className="nova-btn-ghost p-0.5"><X size={11}/></button>
                      </div>
                    )}
                  </div>
                </div>

                {post.hook && post.hook.length > 1 && (
                  <p className="text-sm text-white mt-2 leading-relaxed line-clamp-2">
                    <span className="text-nova-gold font-semibold text-xs mr-1">Hook:</span>{post.hook}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(post.account_ids ?? []).map(id => (
                    <span key={id} className="px-1.5 py-0.5 rounded bg-nova-border/40 text-nova-muted text-[10px] font-mono">
                      {PLATFORMS[id]?.emoji} {PLATFORMS[id]?.name ?? id}
                    </span>
                  ))}
                </div>

                {post.error_msg && (
                  <div className="mt-2 text-[11px] font-mono text-red-300/70 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                    ⚠️ {post.error_msg}
                  </div>
                )}

                {post.sent_at && (
                  <p className="text-[10px] font-mono text-nova-muted mt-2 pt-2 border-t border-nova-border/30">
                    ✓ Sent {new Date(post.sent_at).toLocaleString()}
                    {Array.isArray(post.socialblu_post_ids) && post.socialblu_post_ids.length > 0 &&
                      ` · ${post.socialblu_post_ids.length} Socialblu post${post.socialblu_post_ids.length > 1 ? 's' : ''}`
                    }
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
    </GuestGate>
  )
}
