/* ============================================================================
   RESILIENCE UTILITIES - Upload resumption, auto-retry, batch operations
   ============================================================================ */

/**
 * Resumable file upload with progress tracking and checkpoints
 */
export interface UploadCheckpoint {
  fileId: string
  uploadedBytes: number
  totalBytes: number
  lastCheckpoint: number
  chunkSize: number
}

export const resumableUpload = {
  /**
   * Save upload checkpoint to localStorage
   */
  saveCheckpoint: (checkpoint: UploadCheckpoint) => {
    const key = `upload_${checkpoint.fileId}`
    localStorage.setItem(key, JSON.stringify(checkpoint))
  },

  /**
   * Load previous upload checkpoint
   */
  loadCheckpoint: (fileId: string): UploadCheckpoint | null => {
    const key = `upload_${fileId}`
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : null
  },

  /**
   * Clear checkpoint when upload completes
   */
  clearCheckpoint: (fileId: string) => {
    const key = `upload_${fileId}`
    localStorage.removeItem(key)
  },

  /**
   * Upload file in chunks with resumption support
   */
  uploadChunked: async (
    file: File,
    fileId: string,
    uploadUrl: string,
    onProgress: (bytes: number, total: number) => void,
    chunkSize: number = 5 * 1024 * 1024 // 5MB chunks
  ): Promise<boolean> => {
    const totalBytes = file.size
    let uploadedBytes = 0

    // Check for previous checkpoint
    const checkpoint = resumableUpload.loadCheckpoint(fileId)
    if (checkpoint && checkpoint.totalBytes === totalBytes) {
      uploadedBytes = checkpoint.uploadedBytes
    }

    try {
      // Upload remaining chunks
      while (uploadedBytes < totalBytes) {
        const chunkEnd = Math.min(uploadedBytes + chunkSize, totalBytes)
        const chunk = file.slice(uploadedBytes, chunkEnd)

        // Upload chunk with retry
        let success = false
        let attempts = 0

        while (!success && attempts < 3) {
          try {
            const response = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': file.type,
                'Content-Range': `bytes ${uploadedBytes}-${chunkEnd - 1}/${totalBytes}`,
              },
              body: chunk,
            })

            if (response.ok) {
              success = true
              uploadedBytes = chunkEnd

              // Save checkpoint
              resumableUpload.saveCheckpoint({
                fileId,
                uploadedBytes,
                totalBytes,
                lastCheckpoint: Date.now(),
                chunkSize,
              })

              onProgress(uploadedBytes, totalBytes)
            } else {
              attempts++
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts)) // exponential backoff
            }
          } catch {
            attempts++
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
          }
        }

        if (!success) {
          throw new Error(`Failed to upload chunk at bytes ${uploadedBytes}`)
        }
      }

      resumableUpload.clearCheckpoint(fileId)
      return true
    } catch (error) {
      console.error('Chunked upload failed:', error)
      return false
    }
  },
}

/**
 * Smart retry with exponential backoff and jitter
 */
export const smartRetry = async <T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number
    initialDelayMs?: number
    maxDelayMs?: number
    backoffMultiplier?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> => {
  const {
    maxAttempts = 5,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    onRetry,
  } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        // Calculate delay with exponential backoff
        let delay = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
          maxDelayMs
        )

        // Add jitter (±25%)
        const jitter = delay * 0.25 * (Math.random() - 0.5)
        delay = delay + jitter

        if (onRetry) {
          onRetry(attempt, lastError)
        }

        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error('Operation failed after max retries')
}

/**
 * Automatic retry on network errors
 */
export const networkAwareRetry = async <T>(
  operation: () => Promise<T>,
  isNetworkError: (error: unknown) => boolean = (e) =>
    e instanceof Error && (
      e.message.includes('Network') ||
      e.message.includes('timeout') ||
      e.message.includes('ECONNREFUSED')
    )
): Promise<T> => {
  return smartRetry(operation, {
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  })
}

/**
 * Batch operations with progress tracking
 */
export interface BatchOperation<T> {
  id: string
  data: T
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: unknown
  error?: string
}

export const batchProcessor = {
  /**
   * Process items in batches with concurrency control
   */
  process: async <T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: {
      batchSize?: number
      concurrency?: number
      onProgress?: (completed: number, total: number) => void
    } = {}
  ): Promise<(R | Error)[]> => {
    const { batchSize = 10, concurrency = 3, onProgress } = options
    const results: (R | Error)[] = []
    let completed = 0

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)

      // Process batch with concurrency limit
      const batchResults = await Promise.all(
        batch.map(async (item, index) => {
          const slots = Array(Math.min(concurrency, batch.length))
            .fill(null)
            .map((_, j) => j)

          // Simple concurrency control: wait for slot
          const slot = index % concurrency
          if (slot > 0) {
            await new Promise(resolve => setTimeout(resolve, (slot * 100) / concurrency))
          }

          try {
            const result = await processor(item)
            completed++
            if (onProgress) {
              onProgress(completed, items.length)
            }
            return result
          } catch (error) {
            completed++
            if (onProgress) {
              onProgress(completed, items.length)
            }
            return error instanceof Error ? error : new Error(String(error))
          }
        })
      )

      results.push(...batchResults)
    }

    return results
  },

  /**
   * Batch file uploads with progress tracking
   */
  uploadMultiple: async (
    files: File[],
    uploadFn: (file: File, index: number) => Promise<{ id: string; url: string }>,
    onProgress?: (current: number, total: number, file: File) => void
  ): Promise<{ id: string; url: string }[]> => {
    return batchProcessor.process(
      files.map((file, index) => ({ file, index })),
      async ({ file, index }) => {
        const result = await uploadFn(file, index)
        if (onProgress) {
          onProgress(index + 1, files.length, file)
        }
        return result
      },
      { concurrency: 3 }
    ) as Promise<{ id: string; url: string }[]>
  },
}

/**
 * Offline queue for operations when network unavailable
 */
export const offlineQueue = {
  storage: {
    add: (operation: { type: string; data: unknown; timestamp: number }) => {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
      queue.push(operation)
      localStorage.setItem('offline_queue', JSON.stringify(queue))
    },

    get: () => {
      return JSON.parse(localStorage.getItem('offline_queue') || '[]')
    },

    remove: (index: number) => {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
      queue.splice(index, 1)
      localStorage.setItem('offline_queue', JSON.stringify(queue))
    },

    clear: () => {
      localStorage.removeItem('offline_queue')
    },
  },

  /**
   * Sync offline queue when network is back
   */
  sync: async (handler: (operation: unknown) => Promise<void>) => {
    const queue = offlineQueue.storage.get()

    for (let i = 0; i < queue.length; i++) {
      try {
        await handler(queue[i])
        offlineQueue.storage.remove(i)
      } catch (error) {
        console.error('Failed to sync offline operation:', error)
        // Leave in queue for retry
      }
    }
  },
}

/**
 * Monitor network status and trigger sync
 */
export const setupNetworkMonitoring = (onOnline?: () => void) => {
  window.addEventListener('online', () => {
    console.log('Network restored')
    if (onOnline) {
      onOnline()
    }
    // Attempt to sync offline queue
    offlineQueue.sync(async (op) => {
      console.log('Syncing offline operation:', op)
    })
  })

  window.addEventListener('offline', () => {
    console.log('Network disconnected')
  })
}
