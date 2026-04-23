import GuestGate from '../components/GuestGate'
import { useEffect, useState } from 'react'
import { Send, Check, AlertCircle, Clock, TrendingUp, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type PostStatus = 'pending' | 'processing' | 'sent' | 'failed'

interface QueuePost {
  id: string
  episode_id: string | null
  episode_title: string
  show_name: string
  account_ids: number[]
  scheduled_at: string
  status: PostStatus
  hook: string
  caption: string
  cta: string
  hashtags: string[]
  video_url: string
  error_msg: string | null
  socialblu_post_ids: unknown[]
  sent_at: string | null
  created_at: string
}

const platformNames: { [key: number]: string } = {
  165296: 'TikTok',
  165297: 'Instagram',
  165298: 'YouTube',
  177489: 'Pinterest',
  177779: 'Reddit',
  177890: 'Twitter',
  177891: 'LinkedIn',
}

const platformEmojis: { [key: number]: string } = {
  165296: '🎬',
  165297: '📸',
  165298: '▶️',
  177489: '📌',
  177779: '👽',
  177890: '𝕏',
  177891: '💼',
}

function getStatusColor(status: PostStatus) {
  switch (status) {
    case 'sent':
      return 'bg-teal-500/10 border-teal-500/30 text-teal-400'
    case 'pending':
      return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
    case 'processing':
      return 'bg-blue-500/10 border-blue-500/30 text-blue-400'
    case 'failed':
      return 'bg-red-500/10 border-red-500/30 text-red-400'
    default:
      return 'bg-gray-500/10 border-gray-500/30 text-gray-400'
  }
}

function getStatusIcon(status: PostStatus) {
  switch (status) {
    case 'sent':
      return <Check size={14} />
    case 'pending':
      return <Clock size={14} />
    case 'processing':
      return <RefreshCw size={14} className="animate-spin" />
    case 'failed':
      return <AlertCircle size={14} />
    default:
      return null
  }
}

export default function Scheduler() {
  const [posts, setPosts] = useState<QueuePost[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ sent: 0, pending: 0, failed: 0 })

  useEffect(() => {
    fetchPosts()
    const interval = setInterval(fetchPosts, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  async function fetchPosts() {
    try {
      const { data, error } = await supabase
        .from('nova_post_queue')
        .select('*')
        .order('scheduled_at', { ascending: false })
        .limit(50)

      if (error) throw error

      setPosts(data || [])

      // Calculate stats
      const statData = data?.reduce(
        (acc, post) => {
          if (post.status === 'sent') acc.sent++
          else if (post.status === 'pending') acc.pending++
          else if (post.status === 'failed') acc.failed++
          return acc
        },
        { sent: 0, pending: 0, failed: 0 }
      ) || { sent: 0, pending: 0, failed: 0 }

      setStats(statData)
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-nova-gold" />
          <p className="text-nova-muted text-sm">Loading scheduler...</p>
        </div>
      </div>
    )
  }

  return (
    <GuestGate pageName="Scheduler">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-white mb-1">📤 Post Scheduler</h1>
          <p className="text-nova-muted text-sm">
            Track scheduled and sent posts via Socialblu MCP
          </p>
        </div>
        <button
          onClick={fetchPosts}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-nova-gold/10 hover:bg-nova-gold/20 text-nova-gold border border-nova-gold/30 transition-all text-sm font-body"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-nova-border/30 border border-nova-border/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-nova-muted text-xs font-mono uppercase">Sent</span>
            <Check size={16} className="text-teal-400" />
          </div>
          <p className="text-2xl font-display text-teal-400">{stats.sent}</p>
        </div>

        <div className="bg-nova-border/30 border border-nova-border/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-nova-muted text-xs font-mono uppercase">Pending</span>
            <Clock size={16} className="text-yellow-400" />
          </div>
          <p className="text-2xl font-display text-yellow-400">{stats.pending}</p>
        </div>

        <div className="bg-nova-border/30 border border-nova-border/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-nova-muted text-xs font-mono uppercase">Failed</span>
            <AlertCircle size={16} className="text-red-400" />
          </div>
          <p className="text-2xl font-display text-red-400">{stats.failed}</p>
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-3">
        {posts.length === 0 ? (
          <div className="text-center py-12 bg-nova-border/20 border border-nova-border/30 rounded-lg">
            <Send size={24} className="mx-auto mb-2 text-nova-muted opacity-50" />
            <p className="text-nova-muted text-sm">No posts yet</p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-nova-border/20 border border-nova-border/30 rounded-lg p-4 hover:border-nova-border/50 transition-all"
            >
              {/* Post Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-body font-medium text-white text-sm mb-1">
                    {post.episode_title}
                  </h3>
                  <p className="text-nova-muted text-xs">
                    📺 {post.show_name.replace(/_/g, ' ').toUpperCase()} · 🕐{' '}
                    {new Date(post.scheduled_at).toLocaleString()}
                  </p>
                </div>

                {/* Status Badge */}
                <div
                  className={`px-2 py-1 rounded-md border text-xs font-mono flex items-center gap-1 ${getStatusColor(
                    post.status
                  )}`}
                >
                  {getStatusIcon(post.status)}
                  {post.status.toUpperCase()}
                </div>
              </div>

              {/* Post Content Preview */}
              {post.hook && (
                <p className="text-white text-sm mb-3 line-clamp-2">
                  <span className="text-nova-gold font-semibold">Hook:</span> {post.hook}
                </p>
              )}

              {/* Platforms */}
              <div className="flex flex-wrap gap-2 mb-3">
                {post.account_ids.map((id) => (
                  <span
                    key={id}
                    className="px-2 py-1 rounded-md bg-nova-border/40 text-nova-muted text-xs font-mono flex items-center gap-1"
                  >
                    {platformEmojis[id]} {platformNames[id]}
                  </span>
                ))}
              </div>

              {/* Error Message */}
              {post.error_msg && (
                <div className="text-red-300/70 text-xs bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                  ⚠️ {post.error_msg}
                </div>
              )}

              {/* Meta */}
              <div className="text-nova-muted text-xs font-mono mt-3 pt-3 border-t border-nova-border/30">
                {post.sent_at && (
                  <p>✓ Sent {new Date(post.sent_at).toLocaleString()}</p>
                )}
                {post.status === 'sent' && post.socialblu_post_ids && (
                  <p>
                    📤 Socialblu Posts: {JSON.stringify(post.socialblu_post_ids).length > 2 ? `${Array.isArray(post.socialblu_post_ids) ? post.socialblu_post_ids.length : 1}` : 'pending'}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Box */}
      <div className="bg-nova-gold/5 border border-nova-gold/20 rounded-lg p-4">
        <p className="text-nova-muted text-xs leading-relaxed">
          <TrendingUp size={14} className="inline mr-2" />
          <strong>How it works:</strong> Posts are scheduled via schedule-episode, queued in nova_post_queue, and
          processed by nova-queue-processor every 5 minutes. Claude processes via Socialblu MCP to fire posts to all 7
          platforms. Weekly summary sent to #cj-directives on Sundays.
        </p>
      </div>
    </div>
    </GuestGate>
  )
}