/* ============================================================================
   SECURITY CONFIGURATION - Headers, CORS, CSP
   ============================================================================ */

/**
 * Security headers to apply to all responses
 * These protect against common web vulnerabilities
 */
export const securityHeaders = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://vzzzqsmqqaoilkmskadl.supabase.co https://api.deepgram.com https://api.anthropic.com https://api.socialblu.com",
    "frame-ancestors 'none'",
  ].join('; '),
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Feature policy
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
  ].join(', '),
  
  // HSTS (HTTP Strict Transport Security)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

/**
 * CORS configuration for different environments
 */
export const getCORSConfig = (origin?: string) => {
  const allowedOrigins = [
    'https://nova-producer.vercel.app',
    'https://nova.cjhadisa.com',
    'http://localhost:5173', // dev
    'http://localhost:3000', // dev
  ]

  const isAllowed = origin && allowedOrigins.includes(origin)

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Input validation limits to prevent abuse
 */
export const inputLimits = {
  // Text fields
  showName: { min: 3, max: 255 },
  scriptContent: { min: 10, max: 50000 },
  episodeTitle: { min: 3, max: 255 },
  
  // File uploads
  audioFileSize: { min: 1000, max: 500 * 1024 * 1024 }, // 500MB
  videoFileSize: { min: 1000, max: 1 * 1024 * 1024 * 1024 }, // 1GB
  
  // API payloads
  maxClipsPerEpisode: 10,
  maxAnalyticsDatapoints: 1000,
  maxAuditLogsPerRequest: 100,
}

/**
 * Rate limiting configuration per endpoint
 */
export const rateLimitConfig = {
  // Global
  defaultLimit: { max: 100, windowMs: 60000 }, // 100 req/min
  
  // Per endpoint
  endpoints: {
    '/transcribe-audio': { max: 10, windowMs: 3600000 }, // 10 per hour
    '/generate-clips': { max: 5, windowMs: 86400000 }, // 5 per day
    '/sync-analytics': { max: 20, windowMs: 3600000 }, // 20 per hour
    '/ai-show-producer': { max: 50, windowMs: 3600000 }, // 50 per hour
  },
  
  // Per resource
  perResource: {
    audioUpload: { max: 20, windowMs: 86400000 }, // 20 per day
    clipGeneration: { max: 5, windowMs: 86400000 }, // 5 per day per episode
  },
}

/**
 * Validate request against security limits
 */
export const validateSecurityLimits = (data: Record<string, unknown>): string[] => {
  const errors: string[] = []

  // Check text field lengths
  if (typeof data.show_name === 'string') {
    const { min, max } = inputLimits.showName
    if (data.show_name.length < min || data.show_name.length > max) {
      errors.push(`show_name must be between ${min} and ${max} characters`)
    }
  }

  if (typeof data.script_content === 'string') {
    const { min, max } = inputLimits.scriptContent
    if (data.script_content.length < min || data.script_content.length > max) {
      errors.push(`script_content must be between ${min} and ${max} characters`)
    }
  }

  // Check file sizes
  if (typeof data.file_size === 'number') {
    const { min, max } = inputLimits.audioFileSize
    if (data.file_size < min || data.file_size > max) {
      errors.push(`File size must be between ${min} and ${max} bytes`)
    }
  }

  return errors
}

/**
 * Apply security headers to response
 */
export const applySecurityHeaders = (response: Response): Response => {
  const newResponse = new Response(response.body, response)
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value)
  })

  return newResponse
}
