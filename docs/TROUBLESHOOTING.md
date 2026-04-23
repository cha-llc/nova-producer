# NOVA TROUBLESHOOTING GUIDE

## Common Issues & Solutions

### Audio Upload Issues

**Problem: "File too large" error**
- Max file size is 500MB
- Solution: Compress audio or split into smaller files
- Check: `ffmpeg -i input.mp3 -b:a 128k output.mp3`

**Problem: Upload stuck at 0%**
- Likely network issue
- Solution: Check internet connection, try refresh page
- App auto-resumes if interrupted (saves checkpoint)
- Check: Open DevTools → Network tab for failed requests

**Problem: "Unsupported file format"**
- Supported: MP3, WAV, M4A, FLAC, OGG
- Solution: Convert file using ffmpeg
- Check: `ffmpeg -i input.mov -c:a aac output.m4a`

### Transcription Issues

**Problem: "Transcription failed" after upload**
- Deepgram API error (timeout or bad key)
- Solution: 
  - Verify DEEPGRAM_API_KEY in environment
  - Check file isn't corrupted
  - Try smaller file (< 100MB)
- Wait: Transcription can take 30-60s for 1 hour audio

**Problem: Poor transcription accuracy**
- Audio quality issue
- Solution:
  - Use higher bitrate audio (192kbps+)
  - Ensure clear, mono speech
  - Remove background noise first
  - Check: Use Deepgram console to test audio

**Problem: Transcription timeout (30s)**
- File too large or network slow
- Solution:
  - Use smaller files (split large audios)
  - Check internet speed
  - Retry (auto-retry included)

### Clip Generation Issues

**Problem: "No clips generated"**
- Claude API error or transcript too short
- Solution:
  - Minimum 500 words needed
  - Check transcript displays correctly
  - Verify ANTHROPIC_API_KEY
  - Try again (has auto-retry)

**Problem: Low virality scores**
- Claude's analysis of your content
- Solution:
  - Check clips are actually viral-worthy
  - Edit transcripts for better moments
  - Try different clips
  - Adjust virality_score algorithm in `generate-clips` function

**Problem: Clips generation timeout**
- Claude API slow
- Solution:
  - Wait and retry (auto-retry included)
  - Try shorter transcript (< 5000 words)

### Analytics Issues

**Problem: "No analytics data"**
- Socialblu connection issue
- Solution:
  - Verify SOCIALBLU_API_KEY
  - Check Socialblu account is connected
  - Wait 24h for platform to track data
  - Manual sync via "Sync Now" button

**Problem: Zero views/likes**
- Posts not published yet
- Solution:
  - Check posts actually posted to social media
  - Wait 1-2 hours for initial data
  - Verify platform account is active

**Problem: Inconsistent metrics**
- Platforms update at different times
- Solution: Expected behavior, data updates hourly
- Metrics are cached for 1 hour

### Performance Issues

**Problem: App slow to load**
- First load: Expected (downloads ~2MB)
- Solution:
  - Clear browser cache
  - Disable extensions
  - Check network speed
  - Try different browser
- Check: DevTools → Performance tab

**Problem: Buttons slow to respond**
- Network latency
- Solution:
  - Check internet speed
  - Disable VPN
  - Try wired connection
  - Check server status (health check endpoint)

**Problem: Page freezes during upload**
- Large file upload
- Solution: Expected for 100MB+ files
- App remains responsive, upload continues in background

### Authentication Issues

**Problem: "Not logged in" error**
- Session expired
- Solution: Refresh page (auto-login)
- Check: Browser allows localStorage

**Problem: Can't login**
- Supabase connection issue
- Solution:
  - Check internet
  - Clear localStorage: `localStorage.clear()`
  - Try different browser
  - Verify SUPABASE_URL + SUPABASE_ANON_KEY

**Problem: "Unauthorized" on API calls**
- JWT token invalid
- Solution:
  - Logout + login again
  - Clear localStorage
  - Check token not expired (1 week)

### Database Issues

**Problem: "Error saving to database"**
- Database connection issue
- Solution:
  - Check Supabase status (supabase.io/status)
  - Verify internet
  - Try again (auto-retry included)
  - Check browser console for details

**Problem: RLS policy error**
- Permission denied on query
- Solution:
  - Admin needs to apply migrations
  - Check RLS policies exist
  - Verify user_id matches auth user
  - Contact support if persists

### Browser Compatibility

**Problem: "Feature not supported"**
- Older browser doesn't support feature
- Solution:
  - Use Chrome/Firefox/Safari latest
  - Not supported: IE 11, old iOS Safari
  - Enable WebGL if video doesn't load

**Problem: localStorage not working**
- Browser in incognito/private mode
- Solution:
  - Use normal browsing mode
  - Check browser privacy settings
  - Try different browser

---

## Network Issues

**Problem: "Network error" or "Failed to fetch"**
- Network connectivity issue
- Solution:
  - Check internet speed
  - Disable VPN/proxy
  - Check firewall
  - Retry (auto-retry included)

**Problem: CORS error in console**
- Cross-origin request blocked
- Solution: Likely not your issue (backend configured)
- If persists: Contact support

**Problem: Slow uploads**
- Network bandwidth limited
- Solution:
  - Close other apps using network
  - Use wired connection
  - Try during off-peak hours
  - Split large files

---

## Server Issues

**Problem: "503 Service Unavailable"**
- Server temporarily down
- Solution: Wait 5-10 minutes and retry
- Check: Health endpoint `/api/health`

**Problem: Rate limit error**
- Too many requests too quickly
- Solution:
  - Wait 1 minute
  - Don't spam buttons
  - Limit: 100 req/min per user
  - Specific limits: transcribe (10/hr), clips (5/day)

**Problem: Request timeout**
- Server slow or offline
- Solution:
  - Check health endpoint
  - Retry (auto-retry included)
  - Contact support if persists

---

## Data Recovery

**Problem: Lost upload in progress**
- Browser closed or refreshed
- Solution: Auto-save of progress
- Action: Page reload, upload resumes
- Checkpoint saved locally

**Problem: Deleted clip by mistake**
- No undo yet
- Solution: 
  - Check trash/archive (not yet implemented)
  - Contact support for data recovery
  - Regenerate clips from transcript

---

## Getting Help

1. **Check this guide** - Most issues covered above
2. **Check browser console** - DevTools → Console for error details
3. **Check health endpoint** - Navigate to `/api/health` for server status
4. **Clear cache** - `Ctrl+Shift+Delete` and clear all
5. **Try incognito** - Rules out browser extensions
6. **Contact support** - Email cs@cjhadisa.com with:
   - Error message (screenshot)
   - Steps to reproduce
   - Browser/OS info
   - Network speed test result

---

## Advanced Debugging

### Enable Debug Logging
```javascript
// In browser console
localStorage.setItem('debug_mode', 'true')
// Refresh page for verbose logs
```

### Check API Response
```javascript
// In browser console
fetch('/api/transcribe-audio', {
  method: 'POST',
  body: JSON.stringify({ audio_file_id: 'xxx', show_id: 'xxx' })
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
```

### View Error Logs
- Supabase Dashboard → Functions → Logs
- Check for failed function executions
- Review error_logs table for details

### Monitor Performance
- DevTools → Performance tab
- Record action and check timeline
- Look for long blocking tasks

---

## Tips for Success

1. **Use latest browser** - Chrome, Firefox, Safari
2. **Good internet** - 10+ Mbps for smooth uploads
3. **Close other apps** - Frees up network bandwidth
4. **Don't close browser** - Uploads resume if page refreshed, but not if fully closed
5. **Use good audio** - Clear speech, 128kbps+ bitrate
6. **Check file before upload** - Verify format + content
7. **Wait between operations** - Don't spam buttons
8. **Check notifications** - Slack alerts if transcription fails

---

**Still need help?** Email support@nova.app or chat with us on Slack.
