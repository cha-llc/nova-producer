/* ============================================================================
   UNIT TESTS - Error handling, validation, and utilities
   ============================================================================ */

import { describe, it, expect } from 'vitest'
import {
  NovaError,
  ValidationErrorClass,
  RateLimitError,
  validators,
  validateInput,
  sanitize,
  retry,
  withTimeout,
} from '../src/lib/error-handling'

describe('Error Classes', () => {
  it('should create NovaError with code', () => {
    const error = new NovaError('Test error', 'TEST_CODE')
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_CODE')
    expect(error instanceof Error).toBe(true)
  })

  it('should create ValidationErrorClass', () => {
    const error = new ValidationErrorClass('Invalid input')
    expect(error.code).toBe('VALIDATION_ERROR')
  })

  it('should create RateLimitError', () => {
    const error = new RateLimitError()
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED')
  })
})

describe('Validators', () => {
  it('should validate email', () => {
    expect(validators.isEmail('test@example.com')).toBe(true)
    expect(validators.isEmail('invalid')).toBe(false)
    expect(validators.isEmail('test@')).toBe(false)
  })

  it('should validate UUID', () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000'
    const invalidUUID = 'not-a-uuid'
    expect(validators.isUUID(validUUID)).toBe(true)
    expect(validators.isUUID(invalidUUID)).toBe(false)
  })

  it('should validate URL', () => {
    expect(validators.isUrl('https://example.com')).toBe(true)
    expect(validators.isUrl('http://example.com/path')).toBe(true)
    expect(validators.isUrl('not a url')).toBe(false)
  })

  it('should validate non-empty string', () => {
    expect(validators.isNonEmpty('hello')).toBe(true)
    expect(validators.isNonEmpty('')).toBe(false)
    expect(validators.isNonEmpty('   ')).toBe(false)
  })

  it('should validate string length', () => {
    expect(validators.isLengthBetween('hello', 3, 10)).toBe(true)
    expect(validators.isLengthBetween('hi', 3, 10)).toBe(false)
    expect(validators.isLengthBetween('this is too long', 3, 10)).toBe(false)
  })

  it('should validate positive numbers', () => {
    expect(validators.isPositive(5)).toBe(true)
    expect(validators.isPositive(0)).toBe(false)
    expect(validators.isPositive(-5)).toBe(false)
  })
})

describe('Validation Input', () => {
  it('should validate object against schema', () => {
    const data = { email: 'test@example.com', age: 30 }
    const schema = {
      email: validators.isEmail,
      age: validators.isPositive,
    }
    const errors = validateInput(data, schema)
    expect(errors).toHaveLength(0)
  })

  it('should report validation errors', () => {
    const data = { email: 'invalid', age: -5 }
    const schema = {
      email: validators.isEmail,
      age: validators.isPositive,
    }
    const errors = validateInput(data, schema)
    expect(errors).toHaveLength(2)
    expect(errors[0].field).toBe('email')
  })
})

describe('Sanitization', () => {
  it('should sanitize HTML', () => {
    const dirty = '<script>alert("xss")</script>'
    const clean = sanitize.html(dirty)
    expect(clean).toContain('&lt;script&gt;')
    expect(clean).not.toContain('<script>')
  })

  it('should sanitize filename', () => {
    const dirty = 'file<script>.mp3'
    const clean = sanitize.filename(dirty)
    expect(clean).toBe('file_script_.mp3')
    expect(clean).not.toContain('<')
    expect(clean).not.toContain('>')
  })

  it('should sanitize URL', () => {
    const validUrl = 'https://example.com/path'
    const clean = sanitize.url(validUrl)
    expect(clean).toBe('https://example.com/path')
  })

  it('should reject invalid URL', () => {
    const invalid = 'not a url'
    const clean = sanitize.url(invalid)
    expect(clean).toBe('')
  })
})

describe('Retry Logic', () => {
  it('should retry failed operations', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      if (attempts < 3) throw new Error('Failed')
      return 'success'
    }

    const result = await retry(fn, { maxAttempts: 5 })
    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  it('should fail after max attempts', async () => {
    const fn = async () => {
      throw new Error('Always fails')
    }

    try {
      await retry(fn, { maxAttempts: 2 })
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
    }
  })
})

describe('Timeout', () => {
  it('should timeout long operations', async () => {
    const slowFn = new Promise(resolve => setTimeout(resolve, 5000))

    try {
      await withTimeout(slowFn, 100)
      expect.fail('Should have timed out')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toContain('timeout')
    }
  })

  it('should complete fast operations', async () => {
    const quickFn = Promise.resolve('done')
    const result = await withTimeout(quickFn, 1000)
    expect(result).toBe('done')
  })
})
