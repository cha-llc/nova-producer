# NOVA Environment Setup

## Development Environment

### Required Environment Variables

Create `.env.local` in the `frontend/` directory:

```env
# Supabase
VITE_SUPABASE_URL=https://vzzzqsmqqaoilkmskadl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# APIs
VITE_HEYGEN_API_KEY=<your-heygen-api-key>
VITE_DEEPGRAM_API_KEY=<your-deepgram-api-key>
VITE_ANTHROPIC_API_KEY=<your-claude-api-key>
VITE_SOCIALBLU_API_KEY=<your-socialblu-api-key>

# Slack Notifications
VITE_SLACK_WEBHOOK_ERRORS=https://hooks.slack.com/services/...
VITE_SLACK_WEBHOOK_ALERTS=https://hooks.slack.com/services/...

# Feature Flags
VITE_FEATURE_AUDIO_UPLOAD=true
VITE_FEATURE_TRANSCRIPTION=true
VITE_FEATURE_CLIP_GENERATION=true
VITE_FEATURE_ANALYTICS=true
```

### Setup Instructions

1. **Clone repository**
```bash
git clone https://github.com/cha-llc/nova-producer.git
cd nova-producer
```

2. **Install dependencies**
```bash
# Frontend
cd frontend
npm install

# Edge Functions (Deno)
# No installation needed, dependencies loaded from URLs
```

3. **Configure environment**
```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

4. **Start development server**
```bash
npm run dev
```

5. **Access application**
- Navigate to `http://localhost:5173`
- Login with Supabase account

---

## API Keys Required

### Deepgram (Audio Transcription)
1. Go to https://console.deepgram.com
2. Create account / login
3. Copy API key
4. Add to `VITE_DEEPGRAM_API_KEY`

### HeyGen (Video Generation)
1. Go to https://app.heygen.com
2. Create account / login
3. Copy API key from settings
4. Add to `VITE_HEYGEN_API_KEY`

### Anthropic (Claude API)
1. Go to https://console.anthropic.com
2. Create account / login
3. Copy API key
4. Add to `VITE_ANTHROPIC_API_KEY`

### Socialblu (Social Media Integration)
1. Go to https://app.socialblu.com
2. Create account / login
3. Copy API key from settings
4. Add to `VITE_SOCIALBLU_API_KEY`

### Slack (Error Notifications)
1. Go to https://api.slack.com/apps
2. Create new app
3. Create incoming webhook
4. Copy webhook URL
5. Add to `VITE_SLACK_WEBHOOK_ERRORS`

---

## Supabase Setup

### Database Migrations

Run all migrations to set up database schema:

```bash
# Via Supabase CLI
supabase migration up

# Or manually via SQL editor in Supabase dashboard:
# Run contents of: supabase/migrations/*.sql
```

### RLS Policies

All Row-Level Security policies are created by migrations. Verify in Supabase dashboard:
- Go to **Authentication** → **Policies**
- Should see policies for all new tables (audio_files, transcripts, etc.)

### Storage Buckets

Create two buckets for file uploads:

**Bucket 1: audio-files**
- Access: Private
- CORS: Allow all origins

**Bucket 2: video-clips**
- Access: Private
- CORS: Allow all origins

---

## Deployment

### Vercel

1. Connect GitHub repository
2. Set environment variables in Vercel project settings
3. Deploy automatically on push to `main`

**Environment variables** (in Vercel dashboard):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_HEYGEN_API_KEY
VITE_DEEPGRAM_API_KEY
VITE_ANTHROPIC_API_KEY
VITE_SOCIALBLU_API_KEY
VITE_SLACK_WEBHOOK_ERRORS
```

### Supabase Edge Functions

Deploy Edge Functions:

```bash
# Using Supabase CLI
supabase functions deploy transcribe-audio
supabase functions deploy generate-clips
supabase functions deploy sync-analytics
```

Or use Vercel integration (auto-deploys with frontend).

---

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test error-handling

# Run with coverage
npm test -- --coverage
```

### Building for Production

```bash
# Frontend build
npm run build

# Check build output
dist/

# Preview production build
npm run preview
```

### Code Quality

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format
```

---

## Troubleshooting

### "Failed to fetch" error
- Check Supabase credentials in `.env.local`
- Verify RLS policies allow anonymous access
- Check browser console for full error

### Transcription failures
- Verify Deepgram API key is valid
- Check file format is supported (MP3, WAV, M4A)
- Check file size < 500MB
- Review error logs in Supabase

### Clip generation timeout
- Increase timeout in `apiCall` to 60000ms
- Check Claude API key is valid
- Verify transcript is not empty

### Rate limiting issues
- Check X-RateLimit headers in response
- Implement exponential backoff in client
- Review rate limit windows in _edge-utils

### Slack notifications not working
- Verify webhook URL is correct
- Check webhook scopes in Slack app settings
- Test webhook in Slack API dashboard

---

## Performance Optimization

### Frontend
- Code splitting: Handled by Vite
- Image optimization: Use WebP format
- Lazy loading: Implemented for components
- Caching: Browser + CDN (Vercel)

### Backend
- Database indexing: Created on frequently queried fields
- Edge function optimization: 30s timeout + streaming responses
- Rate limiting: Protects from abuse
- Audit logging: Async, non-blocking

### Monitoring
- Error logs: Stored in Supabase
- Performance metrics: Tracked in browser
- API latency: Monitored in Vercel

---

## Security

### Secrets Management
- Never commit `.env.local` or keys
- Use Vercel secrets for production
- Rotate API keys periodically
- Use service role key only in backend

### RLS Policies
- All tables use row-level security
- Users can only access their own data
- Service role bypasses RLS (for admin operations)

### Input Validation
- All user input validated before API calls
- HTML sanitization on user-generated content
- URL validation for file uploads

### CORS
- Restricted to NOVA domain in production
- Wildcard allowed in development

---

## Support & Resources

- **Documentation**: `/docs/API.md`
- **Type Definitions**: `/frontend/src/types/`
- **Error Handling**: `/frontend/src/lib/error-handling.ts`
- **Edge Functions**: `/supabase/functions/`
- **GitHub Issues**: https://github.com/cha-llc/nova-producer/issues
