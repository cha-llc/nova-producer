/* ============================================================================
   EDGE FUNCTION UTILITIES - Used by all Edge Functions
   ============================================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============ TYPES ============
export interface EdgeFunctionContext {
  request: Request
  userId: string
  showId: string
  timestamp: string
}

export interface EdgeFunctionResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  timestamp: string
}

// ============ SUPABASE CLIENT ============
const getSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============ ERROR HANDLING ============
export class EdgeFunctionError extends Error {
  code: string
  statusCode: number
  details?: unknown

  constructor(message: string, code: string, statusCode: number = 400, details?: unknown) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

// ============ LOGGING ============
export const logError = (message: string, error: unknown, context?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString()
  const errorData = {
    timestamp,
    message,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  }

  console.error('[NOVA EDGE ERROR]', JSON.stringify(errorData))

  // Send to Supabase for audit trail
  const sb = getSupabaseClient()
  sb.from('error_logs')
    .insert([errorData])
    .catch(e => console.error('Failed to log error to DB:', e))

  // Alert Slack on critical errors
  const slackWebhook = Deno.env.get('SLACK_WEBHOOK_ERRORS')
  if (slackWebhook) {
    fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `❌ Edge Function Error: ${message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Error:* ${message}\n*Code:* ${error instanceof Error ? error.constructor.name : 'Unknown'}\n*Time:* ${timestamp}`,
            },
          },
        ],
      }),
    }).catch(() => {})
  }
}

// ============ TIMEOUT ============
export const withTimeout = async <T>(promise: Promise<T>, ms: number = 30000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ])
}

// ============ VALIDATION ============
export const validateRequired = (data: Record<string, unknown>, fields: string[]): string[] => {
  const errors: string[] = []
  for (const field of fields) {
    if (!data[field]) errors.push(`Missing required field: ${field}`)
  }
  return errors
}

export const validateUUID = (value: unknown): boolean =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export const validateEmail = (value: unknown): boolean =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export const validateUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export const validateStringLength = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'string' && value.length >= min && value.length <= max

// ============ RATE LIMITING ============
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export const checkRateLimit = (key: string, maxRequests: number = 10, windowMs: number = 60000): boolean => {
  const now = Date.now()
  const current = rateLimitStore.get(key)

  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (current.count >= maxRequests) {
    return false
  }

  current.count++
  return true
}

// ============ AUTHENTICATION ============
export const extractAuthUserId = (request: Request): string | null => {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  // Note: In production, validate JWT properly
  return token
}

// ============ RESPONSE BUILDERS ============
export const successResponse = <T>(data: T, statusCode: number = 200): Response => {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }),
    {
      status: statusCode,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  )
}

export const errorResponse = (message: string, code: string, statusCode: number = 400): Response => {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString(),
    }),
    {
      status: statusCode,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  )
}

// ============ AUDIT LOGGING ============
export const logAuditEvent = async (payload: {
  show_id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  before_state?: unknown
  after_state?: unknown
}) => {
  const sb = getSupabaseClient()
  const clientIP = Deno.env.get('CF_CONNECTING_IP') || 'unknown'

  try {
    await sb.from('audit_logs').insert([
      {
        ...payload,
        ip_address: clientIP,
        user_agent: 'Edge Function',
      },
    ])
  } catch (error) {
    logError('Failed to write audit log', error, payload)
  }
}

// ============ RETRY WITH EXPONENTIAL BACKOFF ============
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<T> => {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1)
        console.log(`Retry attempt ${attempt} failed, waiting ${delay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// ============ MAIN HANDLER WRAPPER ============
export const createEdgeFunctionHandler = (
  handler: (request: Request, context: EdgeFunctionContext) => Promise<Response>
) => {
  return async (request: Request) => {
    const timestamp = new Date().toISOString()

    try {
      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      }

      // Extract user ID from auth header
      const userId = extractAuthUserId(request)
      if (!userId) {
        return errorResponse('Missing Authorization header', 'AUTH_REQUIRED', 401)
      }

      // Rate limiting check
      if (!checkRateLimit(`user_${userId}`, 100, 60000)) {
        return errorResponse('Rate limit exceeded', 'RATE_LIMIT', 429)
      }

      // Log request
      console.log(`[${timestamp}] ${request.method} ${new URL(request.url).pathname} - User: ${userId}`)

      // Call handler with context
      const context: EdgeFunctionContext = {
        request,
        userId,
        showId: new URL(request.url).searchParams.get('show_id') || '',
        timestamp,
      }

      return await withTimeout(handler(request, context), 30000)
    } catch (error) {
      logError('Edge function handler error', error)

      if (error instanceof EdgeFunctionError) {
        return errorResponse(error.message, error.code, error.statusCode)
      }

      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        'INTERNAL_ERROR',
        500
      )
    }
  }
}
