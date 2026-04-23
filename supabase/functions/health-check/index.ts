// ============================================================================
// HEALTH CHECK ENDPOINT - System status monitoring
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

export default async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const startTime = Date.now()
  const checks = {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(performance.now() / 1000),
    checks: {} as Record<string, unknown>,
  }

  // Check 1: Database connectivity
  try {
    const sb = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await Promise.race([
      sb.from('show_configs').select('count').limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 5000)),
    ])

    checks.checks = {
      ...checks.checks,
      database: error ? { status: 'down', error: error.message } : { status: 'up', ms: Date.now() - startTime },
    }
  } catch (e) {
    checks.checks = { ...checks.checks, database: { status: 'down', error: String(e) } }
  }

  // Check 2: API dependencies
  const depChecks: Record<string, unknown> = {}

  // Deepgram API
  try {
    const dgRes = await Promise.race([
      fetch('https://api.deepgram.com/v1/listen', { method: 'OPTIONS' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000)),
    ])
    depChecks.deepgram = { status: dgRes?.ok ? 'up' : 'degraded' }
  } catch {
    depChecks.deepgram = { status: 'down' }
  }

  // Anthropic API
  try {
    const aRes = await Promise.race([
      fetch('https://api.anthropic.com/v1/messages', { method: 'OPTIONS' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000)),
    ])
    depChecks.anthropic = { status: aRes?.ok ? 'up' : 'degraded' }
  } catch {
    depChecks.anthropic = { status: 'down' }
  }

  checks.checks = { ...checks.checks, dependencies: depChecks }

  // Overall status
  const allUp = Object.values(depChecks).every(v => (v as Record<string, unknown>).status === 'up')
  const responseStatus = allUp ? 200 : 503

  return new Response(
    JSON.stringify({
      ...checks,
      status: allUp ? 'healthy' : 'degraded',
      responseTime: `${Date.now() - startTime}ms`,
    }),
    {
      status: responseStatus,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    }
  )
}
