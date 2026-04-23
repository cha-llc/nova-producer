// ============================================================================
// SYNC ANALYTICS - Pull engagement metrics from Socialblu and compute virality
// ============================================================================

import { createEdgeFunctionHandler, withTimeout, successResponse, errorResponse, logError, logAuditEvent, EdgeFunctionContext } from '../_edge-utils/index.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const socialblueApiKey = Deno.env.get('SOCIALBLU_API_KEY') || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface AnalyticsSyncRequest {
  episode_id: string
  show_id: string
  force_full_sync: boolean
}

export const syncAnalytics = async (request: Request, context: EdgeFunctionContext): Promise<Response> => {
  try {
    const body = await request.json() as AnalyticsSyncRequest

    if (!body.episode_id || !body.show_id) {
      return errorResponse('Missing required fields', 'VALIDATION_ERROR', 400)
    }

    // ============ FETCH EPISODE ============
    const { data: episode, error: episodeError } = await supabase
      .from('ai_episodes')
      .select('id, show_id')
      .eq('id', body.episode_id)
      .eq('show_id', body.show_id)
      .single()

    if (episodeError || !episode) {
      return errorResponse('Episode not found', 'NOT_FOUND', 404)
    }

    // ============ FETCH SCHEDULED POSTS FOR THIS EPISODE ============
    const { data: scheduledPosts, error: postsError } = await supabase
      .from('nova_social_content')
      .select('id, platform_posts:scheduled_posts(*)')
      .eq('episode_id', body.episode_id)

    if (postsError) {
      logError('Failed to fetch scheduled posts', postsError, { episode_id: body.episode_id })
      return errorResponse('Failed to fetch posts', 'DB_ERROR', 500)
    }

    // ============ FETCH METRICS FROM SOCIALBLU FOR EACH PLATFORM ============
    const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'pinterest']
    const analyticsData = []

    for (const platform of platforms) {
      try {
        const metricsResponse = await withTimeout(
          fetch(`https://api.socialblu.com/v1/posts/metrics?platform=${platform}&content_id=${body.episode_id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${socialblueApiKey}`,
              'Accept': 'application/json',
            },
          }),
          15000,
          `Socialblu metrics for ${platform}`
        )

        if (!metricsResponse.ok) {
          console.warn(`Socialblu API returned ${metricsResponse.status} for ${platform}`)
          continue
        }

        const metrics = await metricsResponse.json() as { views?: number; likes?: number; comments?: number; shares?: number }

        const today = new Date().toISOString().split('T')[0]

        const { error: insertError } = await supabase
          .from('episode_analytics')
          .insert([{
            episode_id: body.episode_id,
            platform,
            views: metrics.views || 0,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            click_through_rate: 0,
            watch_time_seconds: 0,
            snapshot_date: today,
          }])
          .onConflict('episode_id,platform,snapshot_date')
          .update({
            views: metrics.views || 0,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
          })

        if (!insertError) {
          analyticsData.push({
            platform,
            views: metrics.views || 0,
            engagement: (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0),
          })
        }
      } catch (error) {
        logError(`Failed to fetch ${platform} metrics`, error, { episode_id: body.episode_id })
        // Continue with other platforms if one fails
      }
    }

    // ============ COMPUTE AND REFRESH PERFORMANCE METRICS ============
    try {
      // Call the SQL function to aggregate and compute virality
      const { error: refreshError } = await supabase.rpc('refresh_performance_metrics', {
        episode_uuid: body.episode_id,
      })

      if (refreshError) {
        logError('Failed to refresh performance metrics', refreshError)
      }
    } catch (error) {
      logError('RPC call failed', error)
    }

    // ============ LOG AUDIT EVENT ============
    await logAuditEvent({
      show_id: body.show_id,
      user_id: context.userId,
      action: 'update',
      entity_type: 'clip',
      entity_id: body.episode_id,
      after_state: { platforms_synced: platforms.length, data_points: analyticsData.length },
    })

    return successResponse(
      {
        analytics_synced: analyticsData,
        platforms_processed: platforms.length,
        timestamp: new Date().toISOString(),
      },
      200
    )
  } catch (error) {
    logError('Sync analytics handler error', error, { userId: context.userId })
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ============ EXPORT HANDLER ============
export default createEdgeFunctionHandler(syncAnalytics)
