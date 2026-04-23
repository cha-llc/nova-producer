/* ============================================================================
   ERROR HANDLING, LOGGING, AND VALIDATION UTILITIES
   ============================================================================ */

import { ApiError, ValidationError } from './index'

// ============ ERROR CLASSES ============
export class NovaError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.details = details
    this.name = 'NovaError'
  }
}

export class ValidationErrorClass extends NovaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends NovaError {
  constructor(message: string = 'Too many requests. Please try again later.') {
    super(message, 'RATE_LIMIT_EXCEEDED')
    this.name = 'RateLimitError'
  }
}

export class AuthenticationError extends NovaError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR')
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends NovaError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

// ============ LOGGING ============
export interface LogContext {
  userId?: string
  showId?: string
  episodeId?: string
  scriptId?: string
  action?: string
  timestamp?: string
  ipAddress?: string
}

export const logger = {
  error: (message: string, error: unknown, context?: LogContext) => {
    const timestamp = new Date().toISOString()
    const logEntry = {
      level: 'ERROR',
      message,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp,
    }
    console.error('[NOVA ERROR]', logEntry)
    // Send to Slack on critical errors
    fetch('/api/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logEntry),
    }).catch(() => {})
  },

  warn: (message: string, context?: LogContext) => {
    console.warn('[NOVA WARN]', { message, context, timestamp: new Date().toISOString() })
  },

  info: (message: string, context?: LogContext) => {
    console.log('[NOVA INFO]', { message, context, timestamp: new Date().toISOString() })
  },

  debug: (message: string, data?: unknown, context?: LogContext) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[NOVA DEBUG]', { message, data, context, timestamp: new Date().toISOString() })
    }
  },
}

// ============ TIMEOUT HELPER ============
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  operationName: string = 'Operation'
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName} timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ])
}

// ============ RETRY LOGIC ============
export const retry = async <T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number; backoffMultiplier?: number } = {}
): Promise<T> => {
  const { maxAttempts = 3, delayMs = 1000, backoffMultiplier = 2 } = options
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxAttempts) {
        const waitTime = delayMs * Math.pow(backoffMultiplier, attempt - 1)
        logger.warn(`Attempt ${attempt} failed, retrying in ${waitTime}ms`, { error: lastError.message })
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxAttempts} attempts`)
}

// ============ API CALL WRAPPER ============
export const apiCall = async <T>(
  url: string,
  options: RequestInit & { timeout?: number; operationName?: string } = {}
): Promise<T> => {
  const { timeout = 30000, operationName = 'API Call', ...fetchOptions } = options

  try {
    const response = await withTimeout(fetch(url, fetchOptions), timeout, operationName)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      throw new NovaError(
        errorData.message || `HTTP ${response.status}`,
        `HTTP_${response.status}`,
        errorData
      )
    }

    return await response.json()
  } catch (error) {
    logger.error(`${operationName} failed`, error, { url })
    throw error
  }
}

// ============ VALIDATION ============
export const validators = {
  isEmail: (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),

  isUUID: (uuid: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid),

  isUrl: (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  },

  isNonEmpty: (value: string): boolean => value.trim().length > 0,

  isLengthBetween: (value: string, min: number, max: number): boolean =>
    value.length >= min && value.length <= max,

  isInteger: (value: unknown): boolean => Number.isInteger(value),

  isPositive: (value: number): boolean => value > 0,
}

export const validateInput = (data: Record<string, unknown>, schema: Record<string, (v: unknown) => boolean>): ValidationError[] => {
  const errors: ValidationError[] = []

  for (const [field, validator] of Object.entries(schema)) {
    if (!validator(data[field])) {
      errors.push({ field, message: `Invalid ${field}` })
    }
  }

  return errors
}

// ============ SANITIZATION ============
export const sanitize = {
  html: (text: string): string => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  },

  filename: (filename: string): string => {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 255)
  },

  url: (url: string): string => {
    try {
      return new URL(url).toString()
    } catch {
      return ''
    }
  },
}

// ============ API ERROR RESPONSE ============
export const formatApiError = (error: unknown): ApiError => {
  const timestamp = new Date().toISOString()

  if (error instanceof NovaError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp,
    }
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      timestamp,
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    timestamp,
  }
}

// ============ ANALYTICS EVENT TRACKING ============
export interface AnalyticsEvent {
  event_name: string
  user_id?: string
  show_id?: string
  episode_id?: string
  properties?: Record<string, unknown>
  timestamp?: string
}

export const trackEvent = (event: AnalyticsEvent) => {
  const payload = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  }

  // Send to analytics endpoint
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(err => logger.debug('Analytics event failed to send', err))
}

// ============ AUDIT LOGGING ============
export interface AuditLogPayload {
  show_id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  before_state?: Record<string, unknown>
  after_state?: Record<string, unknown>
}

export const logAuditEvent = async (payload: AuditLogPayload) => {
  try {
    const ipAddress = await fetch('https://api.ipify.org?format=json')
      .then(r => r.json() as Promise<{ ip: string }>)
      .then(d => d.ip)
      .catch(() => 'unknown')

    await apiCall('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        ip_address: ipAddress,
        user_agent: navigator.userAgent,
      }),
    })
  } catch (error) {
    logger.error('Failed to log audit event', error, { payload })
  }
}
