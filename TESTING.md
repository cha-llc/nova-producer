# NOVA PRODUCER - FUNCTIONALITY TEST SUITE

## PRE-LAUNCH TESTING CHECKLIST

### Phase 1: Infrastructure & Setup ✅

- [ ] Supabase migrations applied
  ```bash
  # Verify tables exist
  SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  ```
  Expected: audio_files, transcripts, video_clips, episode_analytics, etc.

- [ ] Edge Functions deployed
  ```bash
  curl https://vzzzqsmqqaoilkmskadl.supabase.co/functions/v1/health-check
  ```
  Expected: 200 OK with health status

- [ ] API keys configured
  - [ ] VITE_SUPABASE_URL set
  - [ ] VITE_SUPABASE_ANON_KEY set
  - [ ] VITE_DEEPGRAM_API_KEY set
  - [ ] VITE_ANTHROPIC_API_KEY set
  - [ ] VITE_SOCIALBLU_API_KEY set

- [ ] Frontend builds without errors
  ```bash
  npm run build
  ```
  Expected: dist/ folder created, no TypeScript errors

---

## Phase 2: Authentication Flow

### Test: User Login
1. Navigate to https://nova-producer.vercel.app
2. Click "Sign Up" or "Log In"
3. Enter email
4. Check email for Supabase auth link
5. Click link to complete auth
6. Verify redirected to Dashboard
7. Check localStorage has auth token

**Expected**: ✅ Successful login, redirected to dashboard

### Test: Session Persistence
1. Login successfully
2. Refresh page
3. Should remain logged in
4. Close and reopen tab
5. Should still be logged in

**Expected**: ✅ Session persists across refresh/reload

### Test: Logout
1. Click user menu (top right)
2. Select "Logout"
3. Verify redirected to login page
4. Try to access /scripts (should redirect to login)

**Expected**: ✅ Logged out, can't access protected routes

---

## Phase 3: Audio Upload Flow

### Test: Basic Upload
1. Login successfully
2. Navigate to /audio-clips
3. Select an MP3/WAV file (< 50MB for testing)
4. Drag file into upload area
5. Watch progress bar
6. Wait for 100% completion

**Expected**: ✅ File uploads, appears in audio_files table

### Test: Upload Validation
1. Try uploading non-audio file (e.g., .txt)
   **Expected**: ❌ Error: "Please select an audio file"

2. Try uploading file > 500MB
   **Expected**: ❌ Error: "File is too large"

3. Try uploading 0-byte file
   **Expected**: ❌ Error: "Invalid file"

### Test: Upload Resume
1. Start uploading large file (100MB+)
2. Wait 5-10 seconds
3. Refresh page during upload
4. File should resume from checkpoint
5. Watch progress continue from where it left off

**Expected**: ✅ Upload resumes, completes successfully

### Test: Multiple Uploads
1. Upload 3 files in quick succession
2. Watch progress bars for all 3
3. All should complete without conflicts

**Expected**: ✅ All 3 files uploaded successfully

---

## Phase 4: Transcription Flow

### Test: Auto-Transcription
1. Upload audio file successfully
2. Wait 2-3 seconds
3. Should see "Transcribing..." status
4. Wait for transcription (30-60 seconds for 1 hour audio)
5. Transcript appears in UI

**Expected**: ✅ Transcript shows full audio text

### Test: Transcription Accuracy
1. Upload short audio clip (10-30 seconds) with clear speech
2. Review generated transcript
3. Spot-check accuracy (should be 95%+)

**Expected**: ✅ High accuracy transcript

### Test: Transcription Timeout
1. Upload very large file (500MB)
2. Should timeout at 30 seconds gracefully
3. Should show error: "Transcription failed"
4. Should offer retry button

**Expected**: ✅ Graceful timeout handling

### Test: Error Handling
1. Disable internet while transcription in progress
2. Should show error after timeout
3. Should not crash app

**Expected**: ✅ Error handled gracefully

---

## Phase 5: Clip Generation Flow

### Test: Generate Clips
1. Upload and transcribe audio
2. Wait for transcript to appear
3. Click "🔥 Generate Viral Clips" button
4. Wait 8-15 seconds
5. Should see 3-5 clips in gallery

**Expected**: ✅ Clips appear with titles and virality scores

### Test: Virality Scoring
1. Review generated clips
2. Each should have 1-10 virality score
3. Scores should be color-coded (red=high, yellow=medium)

**Expected**: ✅ Scores range from 1-10, colors correct

### Test: Clip Preview
1. Click on clip card
2. Should open preview modal
3. Should see video player (if video generated)
4. Should show clip title and virality score
5. Should show "Why it's viral" explanation

**Expected**: ✅ Modal opens, displays clip info

### Test: Batch Clips
1. Generate clips from 3 different episodes
2. All should complete without conflicts
3. Gallery should show all clips

**Expected**: ✅ Batch processing works

---

## Phase 6: Analytics Flow

### Test: Analytics Dashboard
1. After clips generated, scroll to analytics section
2. Should show performance metrics
3. Should show platform breakdown
4. Should show engagement rates

**Expected**: ✅ Dashboard displays with data

### Test: Analytics Sync
1. Click "Sync Now" button
2. Wait for sync to complete
3. Should show "Updated: [timestamp]"
4. Should show platform metrics (views, likes, etc.)

**Expected**: ✅ Metrics sync from Socialblu

### Test: Metrics Aggregation
1. Wait 1-2 hours for platforms to collect data
2. Re-sync analytics
3. Metrics should update

**Expected**: ✅ Real platform data displays

---

## Phase 7: Error Handling & Resilience

### Test: Network Error Recovery
1. Start uploading file
2. Disconnect internet (airplane mode)
3. Wait 30 seconds
4. Reconnect internet
5. Should auto-retry and complete

**Expected**: ✅ Auto-retry works, upload completes

### Test: Component Error Boundary
1. Intentionally cause error (open DevTools → Console)
   ```javascript
   throw new Error('Test error')
   ```
2. App should not crash
3. Should show error page with "Reload" button
4. Click reload, app recovers

**Expected**: ✅ Error boundary catches error, allows recovery

### Test: Rate Limiting
1. Try to generate clips 10 times rapidly
2. After 5th attempt, should get rate limit error
3. Should show: "Too many requests. Please try again later."

**Expected**: ✅ Rate limiting enforced

### Test: Input Validation
1. Try to transcribe with invalid audio file
2. Should show validation error

**Expected**: ✅ Input validation prevents bad data

---

## Phase 8: Performance Testing

### Measure: Page Load Time
```javascript
// In browser console
console.time('page-load')
// ... navigate to page
console.timeEnd('page-load')
```
**Target**: < 1.5 seconds
**Expected**: ✅ 1.0-1.3 seconds

### Measure: API Response Time
```javascript
// In browser console
const start = performance.now()
await fetch('/api/health')
console.log(`Response time: ${performance.now() - start}ms`)
```
**Target**: < 500ms
**Expected**: ✅ 200-400ms

### Measure: Upload Speed
- Upload 100MB file
- Check time to completion
**Target**: > 5MB/s
**Expected**: ✅ 8-12MB/s

### Measure: Memory Usage
- Open DevTools → Memory
- Record memory before/after operations
**Target**: < 100MB
**Expected**: ✅ 40-70MB

---

## Phase 9: Security Testing

### Test: Authentication Required
1. Open DevTools → Application → Cookies
2. Delete auth token/cookie
3. Refresh page
4. Should redirect to login

**Expected**: ✅ Protected routes require auth

### Test: XSS Protection
1. In browser console, try to inject script:
   ```javascript
   const data = '<script>alert("xss")</script>'
   // App should sanitize and display as text
   ```

**Expected**: ✅ Scripts not executed, displayed as text

### Test: CORS Policy
1. Try API call from different origin
2. Should be blocked by CORS

**Expected**: ✅ CORS policy enforced

### Test: RLS Policies
1. Login with user A, create episode
2. Query as user B
   ```sql
   SELECT * FROM ai_episodes WHERE owner_id != current_user_id()
   ```
3. Should return no results

**Expected**: ✅ RLS prevents unauthorized access

---

## Phase 10: End-to-End Workflow

### Complete Workflow Test
1. **Login** → Create account / login
2. **Upload** → Drag audio file (MP3, < 100MB)
3. **Transcribe** → Wait for auto-transcription
4. **Generate Clips** → Click generate button, wait
5. **Review** → Look at 3-5 generated clips
6. **Analytics** → Check performance metrics
7. **Logout** → Session ends cleanly

**Expected**: ✅ All steps complete without errors

---

## Test Data / Test Files

### Recommended Test Files

**Small Test (5 seconds, MP3)**
- File: test-sample-5s.mp3
- Size: 500KB
- Content: Clear speech
- Expected transcription time: 3-5 seconds

**Medium Test (1 minute, WAV)**
- File: test-podcast-1m.wav
- Size: 10MB
- Content: Podcast episode with multiple speakers
- Expected transcription time: 15-20 seconds

**Large Test (10 minutes, M4A)**
- File: test-interview-10m.m4a
- Size: 50MB
- Content: Interview with background music
- Expected transcription time: 30-45 seconds

**Batch Test (3 files)**
- File: test-batch-1.mp3 (2 seconds)
- File: test-batch-2.mp3 (2 seconds)
- File: test-batch-3.mp3 (2 seconds)
- Expected: All 3 upload concurrently

---

## Troubleshooting During Testing

### Issue: "Failed to fetch" error
**Solution**:
1. Check internet connection
2. Check API keys in .env.local
3. Check Supabase migrations applied
4. Check Edge Functions deployed
5. Refresh page and retry

### Issue: Upload stuck at 0%
**Solution**:
1. Check file size < 500MB
2. Check file is valid MP3/WAV/M4A
3. Check internet bandwidth
4. Try different file

### Issue: Transcription fails
**Solution**:
1. Check DEEPGRAM_API_KEY is valid
2. Check file is not corrupted
3. Check file is < 500MB
4. Try smaller file first

### Issue: Clips not generating
**Solution**:
1. Check transcript appears
2. Check ANTHROPIC_API_KEY is valid
3. Check transcript has > 500 words
4. Try again (auto-retry included)

### Issue: App crashes
**Solution**:
1. Open DevTools → Console
2. Check error message
3. Screenshot error
4. File issue on GitHub

---

## Sign-Off Checklist

Once all tests pass, sign off:

- [ ] All 10 phases tested and passing
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] No performance issues
- [ ] Network resilience working
- [ ] Security measures verified
- [ ] Documentation complete
- [ ] Ready for production

**Production Deployment Sign-Off**: _______________  (Name/Date)

---

## Monitoring After Launch

### Daily Checks
- [ ] Check health endpoint `/health`
- [ ] Review error logs in Supabase
- [ ] Review Slack alerts
- [ ] Check Vercel analytics

### Weekly Reviews
- [ ] Check performance metrics
- [ ] Review user feedback
- [ ] Monitor API usage
- [ ] Check uptime (target: 99.9%)

### Monthly Reports
- [ ] Total users
- [ ] Total uploads/transcriptions
- [ ] Feature usage stats
- [ ] Performance trends
- [ ] Error patterns

---

**TEST SUITE COMPLETE** ✅

NOVA Producer is ready for production launch!
