#!/bin/bash
# ============================================================================
# STEP 1: APPLY SUPABASE MIGRATIONS
# ============================================================================

echo "STEP 1: SUPABASE MIGRATION APPLICATION"
echo "======================================"
echo ""
echo "📍 Current Status: Ready to apply"
echo ""

# Display migration summary
echo "Migration File: supabase/migrations/20260423_add_transcription_clips_analytics.sql"
echo "Size: ~400 lines"
echo ""
echo "TABLES TO CREATE:"
echo "  ✅ audit_logs"
echo "  ✅ error_logs"
echo "  ✅ audio_files"
echo "  ✅ transcripts"
echo "  ✅ video_clips"
echo "  ✅ episode_analytics"
echo "  ✅ performance_metrics"
echo "  ✅ rate_limit_tracking"
echo ""

echo "🔐 RLS POLICIES:"
echo "  ✅ All tables locked to owner_id"
echo "  ✅ Users see only own data"
echo "  ✅ Full audit trail enabled"
echo ""

# Verify file size
FILE_SIZE=$(wc -l < supabase/migrations/20260423_add_transcription_clips_analytics.sql)
echo "Total SQL Lines: $FILE_SIZE"
echo ""

# Display first 50 lines for verification
echo "MIGRATION CONTENT (first 50 lines):"
echo "===================================="
head -50 supabase/migrations/20260423_add_transcription_clips_analytics.sql
echo ""
echo "... (truncated, full file available)"
echo ""

# Create copy-paste guide
cat > /tmp/migration_guide.txt << 'EOF'
╔════════════════════════════════════════════════════════════════════════════╗
║            SUPABASE MIGRATION APPLICATION GUIDE                           ║
╚════════════════════════════════════════════════════════════════════════════╝

⚡ QUICK STEPS:

1. Open Supabase Dashboard
   https://app.supabase.com/project/vzzzqsmqqaoilkmskadl/sql/new

2. Copy entire migration file content:
   cat supabase/migrations/20260423_add_transcription_clips_analytics.sql

3. Paste into SQL Editor

4. Click "RUN" button

5. Wait for "Success" message (usually < 30 seconds)

6. Verify tables created:
   
   ✓ Supabase Dashboard → Table Editor
   ✓ Should show 8 new tables:
     - audit_logs
     - error_logs
     - audio_files
     - transcripts
     - video_clips
     - episode_analytics
     - performance_metrics
     - rate_limit_tracking

════════════════════════════════════════════════════════════════════════════

⚠️  VERIFICATION QUERIES (run after migration):

-- Check audit_logs table exists
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'audit_logs';

-- Check RLS policies enabled
SELECT * FROM pg_policies WHERE tablename LIKE 'audit%';

-- Check all new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN (
  'audit_logs', 'error_logs', 'audio_files', 'transcripts',
  'video_clips', 'episode_analytics', 'performance_metrics',
  'rate_limit_tracking'
);

════════════════════════════════════════════════════════════════════════════

✅ EXPECTED OUTPUT:

After migration completes, you should see:
  ✓ "Migration executed successfully" message
  ✓ 8 tables in Table Editor
  ✓ All RLS policies enabled
  ✓ All indexes created

════════════════════════════════════════════════════════════════════════════
EOF

cat /tmp/migration_guide.txt

echo ""
echo "📋 MIGRATION STATUS: Ready"
echo ""
echo "Next: Verify Edge Functions deployment..."
