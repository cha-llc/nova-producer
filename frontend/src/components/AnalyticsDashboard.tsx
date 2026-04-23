import { useState, useEffect } from 'react'
import { TrendingUp, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { EpisodeAnalytics, PerformanceMetrics } from '../types'
import { apiCall, logger, trackEvent } from '../lib/error-handling'

interface AnalyticsDashboardProps {
  episodeId: string
  showId: string
}

export default function AnalyticsDashboard({ episodeId, showId }: AnalyticsDashboardProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [analytics, setAnalytics] = useState<EpisodeAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalytics()
  }, [episodeId])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch performance metrics
      const metricsData = await apiCall<PerformanceMetrics>(
        `/api/performance-metrics?episode_id=${episodeId}`,
        { operationName: 'Fetch performance metrics' }
      )

      setMetrics(metricsData)

      // Fetch platform-specific analytics
      const analyticsData = await apiCall<EpisodeAnalytics[]>(
        `/api/episode-analytics?episode_id=${episodeId}`,
        { operationName: 'Fetch episode analytics' }
      )

      setAnalytics(analyticsData)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load analytics'
      setError(errorMsg)
      logger.error('Failed to load analytics', err, { episodeId })
    } finally {
      setLoading(false)
    }
  }

  const handleSyncAnalytics = async () => {
    setSyncing(true)
    try {
      trackEvent({
        event_name: 'analytics_sync_started',
        episode_id: episodeId,
        show_id: showId,
      })

      await apiCall(
        '/api/sync-analytics',
        {
          method: 'POST',
          body: JSON.stringify({
            episode_id: episodeId,
            show_id: showId,
            force_full_sync: true,
          }),
          operationName: 'Sync analytics',
        }
      )

      // Reload analytics
      await loadAnalytics()

      trackEvent({
        event_name: 'analytics_sync_completed',
        episode_id: episodeId,
        show_id: showId,
      })
    } catch (err) {
      logger.error('Failed to sync analytics', err, { episodeId })
      setError(err instanceof Error ? err.message : 'Failed to sync analytics')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="text-nova-gold animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={24} className="text-nova-gold" />
          <div>
            <h3 className="text-xl font-display text-white">Performance Metrics</h3>
            <p className="text-xs text-nova-muted">Real-time engagement data across platforms</p>
          </div>
        </div>
        <button
          onClick={handleSyncAnalytics}
          disabled={syncing}
          className="px-4 py-2 rounded-lg bg-nova-teal text-white text-sm font-body hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          Sync Now
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-nova-crimson/10 border border-nova-crimson flex items-start gap-3">
          <AlertTriangle size={20} className="text-nova-crimson flex-shrink-0 mt-0.5" />
          <p className="text-nova-crimson text-sm">{error}</p>
        </div>
      )}

      {metrics ? (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Views */}
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted hover:border-nova-gold transition-all">
              <p className="text-xs text-nova-muted uppercase font-body mb-2">Total Views</p>
              <p className="text-3xl font-display text-nova-gold">{metrics.total_views.toLocaleString()}</p>
              <p className="text-xs text-nova-muted mt-2">across all platforms</p>
            </div>

            {/* Total Engagement */}
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted hover:border-nova-gold transition-all">
              <p className="text-xs text-nova-muted uppercase font-body mb-2">Engagement</p>
              <p className="text-3xl font-display text-nova-gold">{metrics.total_engagement.toLocaleString()}</p>
              <p className="text-xs text-nova-muted mt-2">likes, comments, shares</p>
            </div>

            {/* Virality Index */}
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted hover:border-nova-gold transition-all">
              <p className="text-xs text-nova-muted uppercase font-body mb-2">Virality Index</p>
              <p className="text-3xl font-display text-nova-gold">{metrics.virality_index.toFixed(1)}</p>
              <p className="text-xs text-nova-muted mt-2">out of 100</p>
            </div>

            {/* Top Platform */}
            <div className="p-4 rounded-lg bg-nova-navy border border-nova-muted hover:border-nova-gold transition-all">
              <p className="text-xs text-nova-muted uppercase font-body mb-2">Top Platform</p>
              <p className="text-2xl font-display text-nova-gold capitalize">{metrics.top_platform || 'N/A'}</p>
              <p className="text-xs text-nova-muted mt-2">highest engagement</p>
            </div>
          </div>

          {/* Platform Breakdown */}
          {analytics.length > 0 && (
            <div>
              <h4 className="font-display text-white mb-4">Platform Breakdown</h4>
              <div className="space-y-3">
                {analytics.map(platform => {
                  const totalEngagement = platform.likes + platform.comments + platform.shares
                  const engagementRate = platform.views > 0 ? (totalEngagement / platform.views) * 100 : 0

                  return (
                    <div key={platform.id} className="p-4 rounded-lg bg-nova-navy border border-nova-muted">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-display text-white capitalize">{platform.platform}</span>
                        <span className="text-xs text-nova-muted">{platform.snapshot_date}</span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                        <div>
                          <p className="text-nova-muted">Views</p>
                          <p className="text-white font-body">{platform.views.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-nova-muted">Likes</p>
                          <p className="text-white font-body">{platform.likes.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-nova-muted">Comments</p>
                          <p className="text-white font-body">{platform.comments.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-nova-muted">Shares</p>
                          <p className="text-white font-body">{platform.shares.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Engagement Rate Bar */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-nova-muted">Engagement Rate</span>
                          <span className="text-xs text-nova-gold font-body">{engagementRate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-nova-muted/20 rounded-full h-2">
                          <div
                            className="bg-nova-gold h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(engagementRate * 10, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {analytics.length === 0 && (
            <div className="text-center py-8 text-nova-muted">
              <p>No analytics data yet. Sync now to pull the latest metrics from your social platforms.</p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-nova-muted">
          <p>No performance metrics available yet.</p>
        </div>
      )}
    </div>
  )
}
