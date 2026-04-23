# NOVA API DOCUMENTATION

## Overview

NOVA uses Supabase Edge Functions for all backend operations. All endpoints require authentication via Bearer token.

**Base URL**: `https://<project>.supabase.co/functions/v1/`

**Authentication**: All requests must include:
```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Transcribe Audio
**Endpoint**: `POST /transcribe-audio`

Convert audio files to text transcripts using Deepgram API.

**Request**:
```json
{
  "audio_file_id": "uuid",
  "show_id": "uuid"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "audio_id": "uuid",
    "full_text": "...",
    "segments": [],
    "language": "en",
    "word_count": 2500,
    "created_at": "2026-04-23T12:00:00Z",
    "updated_at": "2026-04-23T12:00:00Z"
  },
  "timestamp": "2026-04-23T12:00:00Z"
}
```

**Error Responses**:
- `400`: Validation error (missing fields)
- `404`: Audio file not found
- `500`: Transcription failed / API error

**Rate Limit**: 10 transcriptions per hour per user

---

### 2. Generate Clips
**Endpoint**: `POST /generate-clips`

Automatically extract viral moments from episodes using Claude AI analysis.

**Request**:
```json
{
  "episode_id": "uuid",
  "show_id": "uuid",
  "use_transcript": true
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "clips": [
      {
        "id": "uuid",
        "episode_id": "uuid",
        "title": "Viral moment title",
        "start_time": 0,
        "end_time": 45000,
        "status": "pending",
        "virality_score": 8.5,
        "key_moments": ["Why this is viral..."],
        "created_at": "2026-04-23T12:00:00Z"
      }
    ],
    "count": 5,
    "message": "Generated 5 clip candidates"
  },
  "timestamp": "2026-04-23T12:00:00Z"
}
```

**Error Responses**:
- `400`: Validation error
- `404`: Episode not found
- `500`: Claude API error / processing failed

**Rate Limit**: 5 clip generations per day per episode

---

### 3. Sync Analytics
**Endpoint**: `POST /sync-analytics`

Pull engagement metrics from Socialblu and compute virality scores.

**Request**:
```json
{
  "episode_id": "uuid",
  "show_id": "uuid",
  "force_full_sync": false
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "analytics_synced": [
      {
        "platform": "instagram",
        "views": 1250,
        "engagement": 87
      }
    ],
    "platforms_processed": 6,
    "timestamp": "2026-04-23T12:00:00Z"
  },
  "timestamp": "2026-04-23T12:00:00Z"
}
```

**Error Responses**:
- `400`: Validation error
- `404`: Episode not found
- `500`: Socialblu API error

**Rate Limit**: 20 syncs per hour per show

---

### 4. Produce with Nova (Existing)
**Endpoint**: `POST /ai-show-producer`

Generate video using HeyGen avatar.

**Request**:
```json
{
  "script_id": "uuid",
  "show_name": "sunday_power_hour",
  "voice_id": "string",
  "avatar_id": "string",
  "heygen_voice_id": "string",
  "show_color": "#1A1A2E",
  "background_url": "https://..."
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "video_id": "heygen_id",
    "video_url": "https://...",
    "thumbnail_url": "https://..."
  },
  "timestamp": "2026-04-23T12:00:00Z"
}
```

---

## Rate Limiting

All endpoints enforce rate limiting:

- **Standard**: 100 requests per minute per user
- **Audio Upload**: 10 per hour
- **Clip Generation**: 5 per day per episode
- **Analytics Sync**: 20 per hour per show

When limit exceeded, returns `429 Too Many Requests`:
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT",
  "timestamp": "2026-04-23T12:00:00Z"
}
```

---

## Error Handling

All errors follow consistent format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "timestamp": "2026-04-23T12:00:00Z"
}
```

**Common Error Codes**:
- `VALIDATION_ERROR`: Input validation failed
- `NOT_FOUND`: Resource not found
- `AUTH_ERROR`: Authentication failed
- `RATE_LIMIT`: Rate limit exceeded
- `INTERNAL_ERROR`: Server error
- `TIMEOUT`: Operation exceeded timeout (30s max)

---

## Request Examples

### Upload and Transcribe Audio
```bash
# 1. Upload audio file (using Supabase Storage API)
curl -X POST "https://api.nova.app/upload-audio" \
  -H "Authorization: Bearer <token>" \
  -F "file=@episode.mp3"

# Response: { "file_id": "uuid", "s3_url": "https://..." }

# 2. Transcribe
curl -X POST "https://<project>.supabase.co/functions/v1/transcribe-audio" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "audio_file_id": "uuid",
    "show_id": "uuid"
  }'
```

### Generate and Sync Metrics
```bash
# 1. Generate clips
curl -X POST "https://<project>.supabase.co/functions/v1/generate-clips" \
  -H "Authorization: Bearer <jwt>" \
  -d '{
    "episode_id": "uuid",
    "show_id": "uuid",
    "use_transcript": true
  }'

# 2. Sync analytics
curl -X POST "https://<project>.supabase.co/functions/v1/sync-analytics" \
  -H "Authorization: Bearer <jwt>" \
  -d '{
    "episode_id": "uuid",
    "show_id": "uuid",
    "force_full_sync": true
  }'
```

---

## Integration with Frontend

Use the `apiCall` helper function for all requests:

```typescript
import { apiCall } from '@/lib/error-handling'

// Transcribe audio
const transcript = await apiCall('/api/transcribe-audio', {
  method: 'POST',
  body: JSON.stringify({
    audio_file_id: audioId,
    show_id: showId,
  }),
  operationName: 'Transcribe audio',
})

// Generate clips
const { clips } = await apiCall('/api/generate-clips', {
  method: 'POST',
  body: JSON.stringify({
    episode_id: episodeId,
    show_id: showId,
    use_transcript: true,
  }),
  timeout: 60000, // 1 minute for clip generation
  operationName: 'Generate clips',
})

// Sync analytics
const analytics = await apiCall('/api/sync-analytics', {
  method: 'POST',
  body: JSON.stringify({
    episode_id: episodeId,
    show_id: showId,
  }),
  operationName: 'Sync analytics',
})
```

---

## Webhook Events

When operations complete, webhook events are sent to configured URL:

```json
{
  "event": "transcription.complete",
  "data": {
    "audio_file_id": "uuid",
    "transcript_id": "uuid",
    "word_count": 2500
  },
  "timestamp": "2026-04-23T12:00:00Z"
}
```

**Event Types**:
- `transcription.complete`
- `transcription.failed`
- `clips.generated`
- `clips.failed`
- `analytics.synced`

---

## Monitoring & Debugging

All requests are logged with context:
- Request timestamp
- User ID
- Show/Episode/Audio IDs
- Response status
- Error details (if failed)

Access logs via Supabase dashboard: **Functions** → **Logs**

---

## Best Practices

1. **Always validate input** before API calls
2. **Use retry logic** for transient failures
3. **Handle timeouts** gracefully (30s max per request)
4. **Check rate limits** and implement backoff
5. **Log errors** with context for debugging
6. **Use feature flags** for beta features
7. **Monitor latency** and adjust timeouts

---

## Version History

- **v1.0** (Apr 23, 2026): Initial release with transcription, clips, analytics
- **v1.1** (Coming): Multi-language support
- **v1.2** (Coming): Team collaboration endpoints
- **v2.0** (Coming): Webhooks and streaming responses
