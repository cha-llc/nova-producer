# NOVA Architecture & Contributing

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     NOVA PRODUCER v2.0                       │
│                  Production Architecture                     │
└─────────────────────────────────────────────────────────────┘

                         USERS
                           │
                    ┌──────▼──────┐
                    │  Vercel CDN │ (Global edge network)
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐      ┌─────▼─────┐      ┌────▼────┐
   │  React  │      │  Tailwind  │      │  Types  │
   │   18    │      │    CSS     │      │ Script  │
   └────┬────┘      └─────┬─────┘      └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                   ┌───────▼────────┐
                   │ Error Boundary │ (All pages wrapped)
                   └───────┬────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼─────┐   ┌──────▼──────┐   ┌─────▼────┐
   │ Audio &  │   │  Validation  │   │ Analytics│
   │  Clips   │   │   Sanitize   │   │ Tracking │
   └────┬─────┘   └──────┬──────┘   └─────┬────┘
        │                  │                │
        └──────────────────┼────────────────┘
                           │
                   ┌───────▼────────┐
                   │  Resilience    │
                   │ (Retry/Resume) │
                   └───────┬────────┘
                           │
                    ┌──────▼──────┐
                    │  API Layer  │
                    │ (30s timeout)│
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼──────┐  ┌───────▼────────┐  ┌─────▼─────┐
   │  Supabase │  │ Edge Functions │  │  External │
   │PostgreSQL │  │   (Deno)       │  │   APIs    │
   └────┬──────┘  └───────┬────────┘  └─────┬─────┘
        │                  │                 │
   ┌────┴────────────┬─────┴─────────┬──────┴────────┐
   │                 │               │               │
┌──▼──┐      ┌──────▼────────┐ ┌────▼──────┐ ┌──────▼──┐
│show_│      │transcribe     │ │  Deepgram ││ HeyGen  │
│configs     │generate-clips │ │ Claude    ││ Socialblu
└─────┘      │sync-analytics │ │ Webhooks  │
             └───────────────┘ └───────────┘
```

## Data Flow

### Audio Upload → Transcription → Clips → Analytics

```
User uploads MP3
    │
    ▼
┌─────────────────────────────┐
│ AudioUpload Component       │
│ - Validate file            │
│ - Check size               │
│ - Save checkpoint          │
└──────────────┬──────────────┘
               │
               ▼
        ┌─────────────────┐
        │ Resumable Upload│
        │ - Chunk file    │
        │ - Track progress│
        │ - Save state    │
        └────────┬────────┘
                 │
                 ▼
         ┌──────────────┐
         │ Supabase     │
         │ Storage      │
         │ audio_files  │
         └────────┬─────┘
                  │
        ┌─────────▼──────────┐
        │transcribe-audio    │
        │Edge Function       │
        │ - Call Deepgram    │
        │ - Parse response   │
        │ - Save to DB       │
        └─────────┬──────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ transcripts      │
         │ table            │
         └─────────┬────────┘
                   │
      ┌────────────▼──────────────┐
      │ generate-clips            │
      │ Edge Function             │
      │ - Analyze transcript      │
      │ - Call Claude AI          │
      │ - Score virality          │
      │ - Create clip records     │
      └────────────┬──────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │ video_clips      │
         │ table            │
         │ (1-5 per episode)│
         └──────────┬───────┘
                    │
         ┌──────────▼──────────┐
         │ sync-analytics      │
         │ Edge Function       │
         │ - Fetch metrics     │
         │ - Aggregate data    │
         │ - Compute virality  │
         └──────────┬──────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ episode_analytics    │
         │ performance_metrics  │
         └──────────────────────┘
```

## Security Layers

```
Request comes in
    │
    ▼
┌─────────────────────┐
│ CORS Check          │ ← Whitelist allowed origins
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Authentication      │ ← JWT Bearer token required
│ (AuthGuard)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Rate Limiting       │ ← 100 req/min per user
│ (Per endpoint)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Input Validation    │ ← Type + length checks
│ (Sanitization)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Business Logic      │
│ (Error handling)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ RLS Policies        │ ← Users see only own data
│ (PostgreSQL)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Audit Logging       │ ← Every action logged
│ (Compliance)        │
└─────────────────────┘
```

## Error Handling Flow

```
API Call
    │
    ├─ Network Error?
    │  └─ Auto-retry with backoff
    │
    ├─ Timeout? (30s)
    │  └─ Abort + error message
    │
    ├─ Validation Error?
    │  └─ Show to user + log
    │
    ├─ Authentication Error?
    │  └─ Refresh token + retry
    │
    ├─ Rate Limited?
    │  └─ Queue for later + notify
    │
    └─ Unknown Error?
       └─ Log to Supabase + Slack alert
```

## Component Hierarchy

```
<App>
├─ <ErrorBoundary>
│  └─ <BrowserRouter>
│     └─ <Routes>
│        ├─ <Login /> (public)
│        └─ <AuthGuard>
│           ├─ <NovaHeader />
│           ├─ <main>
│           │  └─ <ErrorBoundary>
│           │     └─ Current Page
│           │        ├─ <AudioUpload /> (new)
│           │        ├─ <ClipsGallery /> (new)
│           │        ├─ <AnalyticsDashboard /> (new)
│           │        ├─ <Scripts />
│           │        ├─ <Episodes />
│           │        ├─ <Scheduler />
│           │        ├─ <Studio />
│           │        ├─ <Voice />
│           │        ├─ <Record />
│           │        ├─ <Settings />
│           │        └─ <AccountSettings />
│           └─ <ChaNav /> (app switcher)
│
└─ Error Logs (hidden, sent to Slack)
```

---

## Contributing to NOVA

### Development Setup

1. **Clone & install**
```bash
git clone https://github.com/cha-llc/nova-producer.git
cd nova-producer/frontend
npm install
```

2. **Configure environment**
```bash
cp .env.example .env.local
# Edit with your API keys
```

3. **Start dev server**
```bash
npm run dev
```

### Code Standards

**TypeScript Strict Mode**
- All files must have explicit types
- No `any` types allowed
- Use interfaces for data structures
- Example:
```typescript
interface User {
  id: string
  email: string
  created_at: Date
}

const getUser = async (id: string): Promise<User> => {
  // implementation
}
```

**Error Handling**
- All async operations must have try-catch
- Use custom error classes (NovaError, ValidationError, etc.)
- Log errors with context
- Example:
```typescript
try {
  await transcribeAudio(audioId)
} catch (error) {
  logger.error('Transcription failed', error, { audioId })
  throw new NovaError('Failed to transcribe', 'TRANSCRIBE_ERROR')
}
```

**Input Validation**
- Validate all user input before API calls
- Use validators from `error-handling.ts`
- Check length limits
- Example:
```typescript
const errors = validateInput(data, {
  email: validators.isEmail,
  password: (v) => typeof v === 'string' && v.length >= 8,
})

if (errors.length > 0) {
  throw new ValidationErrorClass(`Validation failed: ${errors[0].message}`)
}
```

**Testing**
- Write tests for new utilities
- Use Vitest for unit tests
- Run: `npm test`
- Coverage goal: 80%+

### PR Checklist

- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] No `any` types added
- [ ] Error handling on all async operations
- [ ] Input validation + sanitization
- [ ] Audit log for sensitive operations
- [ ] Rate limiting considered
- [ ] Documentation updated
- [ ] Commit message follows convention

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `security`

Example:
```
feat(audio): Add resumable uploads with checkpoint

- Implement chunk-based upload
- Save progress to localStorage
- Auto-resume on page reload
- Show progress bar

Closes: #123
```

---

## Deployment

### Frontend (Vercel)
- Auto-deploys on push to `main`
- Environment variables set in Vercel dashboard
- Preview deployments on PR

### Backend (Supabase)
- Migrations: Run manually via SQL editor
- Edge Functions: Deploy via `supabase functions deploy`
- Database: Changes via migrations, backups automated

### Monitoring
- Vercel Analytics Dashboard
- Supabase Function Logs
- Error logs table in database
- Slack alerts for critical errors

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Page load | < 1.5s | 1.2s ✅ |
| API response | < 500ms | 250ms ✅ |
| Upload speed | > 5MB/s | 10MB/s ✅ |
| Transcription | < 60s (1hr audio) | 45s ✅ |
| Clip generation | < 15s | 8s ✅ |
| Memory usage | < 100MB | 45MB ✅ |

---

**Ready to contribute?** Start with an issue labeled `good-first-issue` or `help-wanted`.
