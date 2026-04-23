-- ============================================================================
-- NOVA PRODUCER - COMPREHENSIVE SCHEMA UPGRADE
-- Adds: Transcription, Clip Generation, Analytics, Audit Logging, Error Tracking
-- ============================================================================

-- ============ AUDIT LOGGING ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'approve', 'publish', 'archive')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('script', 'episode', 'clip', 'show_config', 'audio_file')),
  entity_id TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_show_id ON audit_logs(show_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============ ERROR LOGGING ============
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  context JSONB,
  severity TEXT CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_error_logs_severity ON error_logs(severity);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);

-- ============ AUDIO FILES ============
CREATE TABLE IF NOT EXISTS audio_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id UUID NOT NULL REFERENCES show_configs(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES ai_episodes(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration_seconds INTEGER,
  s3_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'transcribing', 'transcribed', 'failed')
  ),
  error_msg TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audio_files_show_id ON audio_files(show_id);
CREATE INDEX idx_audio_files_episode_id ON audio_files(episode_id);
CREATE INDEX idx_audio_files_status ON audio_files(status);

-- ============ TRANSCRIPTS ============
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audio_id UUID NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES ai_episodes(id) ON DELETE SET NULL,
  full_text TEXT NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]', -- Array of { start_time, end_time, text, speaker, confidence }
  language TEXT DEFAULT 'en',
  word_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transcripts_audio_id ON transcripts(audio_id);
CREATE INDEX idx_transcripts_episode_id ON transcripts(episode_id);

-- ============ VIDEO CLIPS ============
CREATE TABLE IF NOT EXISTS video_clips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES ai_episodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time INTEGER NOT NULL, -- milliseconds
  end_time INTEGER NOT NULL,
  transcript_segment_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'generating', 'ready', 'failed')
  ),
  video_url TEXT,
  thumbnail_url TEXT,
  virality_score DECIMAL(5, 2),
  key_moments TEXT[] DEFAULT ARRAY[]::TEXT[],
  captions TEXT,
  error_msg TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_video_clips_episode_id ON video_clips(episode_id);
CREATE INDEX idx_video_clips_status ON video_clips(status);
CREATE INDEX idx_video_clips_virality_score ON video_clips(virality_score DESC);

-- ============ EPISODE ANALYTICS ============
CREATE TABLE IF NOT EXISTS episode_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES ai_episodes(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  click_through_rate DECIMAL(5, 2) DEFAULT 0,
  watch_time_seconds INTEGER DEFAULT 0,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(episode_id, platform, snapshot_date)
);

CREATE INDEX idx_episode_analytics_episode_id ON episode_analytics(episode_id);
CREATE INDEX idx_episode_analytics_platform ON episode_analytics(platform);
CREATE INDEX idx_episode_analytics_snapshot_date ON episode_analytics(snapshot_date DESC);

-- ============ PERFORMANCE METRICS (AGGREGATED) ============
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES ai_episodes(id) ON DELETE CASCADE,
  total_views INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0, -- likes + comments + shares
  average_watch_time DECIMAL(10, 2) DEFAULT 0,
  virality_index DECIMAL(5, 2) DEFAULT 0, -- computed score
  top_platform TEXT,
  best_posting_time TIME,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(episode_id)
);

CREATE INDEX idx_performance_metrics_episode_id ON performance_metrics(episode_id);
CREATE INDEX idx_performance_metrics_virality_index ON performance_metrics(virality_index DESC);

-- ============ RATE LIMIT TRACKING ============
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  key TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  reset_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_user_id ON rate_limit_tracking(user_id);
CREATE INDEX idx_rate_limit_key ON rate_limit_tracking(key);
CREATE INDEX idx_rate_limit_reset_time ON rate_limit_tracking(reset_time);

-- ============ ROW-LEVEL SECURITY (RLS) POLICIES ============

-- Audio Files: Users can only access their own show's audio files
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_access_own_show_audio"
  ON audio_files
  FOR SELECT
  USING (
    show_id IN (
      SELECT id FROM show_configs WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "users_can_insert_own_show_audio"
  ON audio_files
  FOR INSERT
  WITH CHECK (
    show_id IN (
      SELECT id FROM show_configs WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "users_can_update_own_show_audio"
  ON audio_files
  FOR UPDATE
  USING (
    show_id IN (
      SELECT id FROM show_configs WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "users_can_delete_own_show_audio"
  ON audio_files
  FOR DELETE
  USING (
    show_id IN (
      SELECT id FROM show_configs WHERE owner_id = auth.uid()
    )
  );

-- Transcripts: Users can only access transcripts for their episodes
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_access_own_transcripts"
  ON transcripts
  FOR SELECT
  USING (
    audio_id IN (
      SELECT id FROM audio_files WHERE show_id IN (
        SELECT id FROM show_configs WHERE owner_id = auth.uid()
      )
    )
  );

-- Video Clips: Users can only access clips from their episodes
ALTER TABLE video_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_access_own_clips"
  ON video_clips
  FOR SELECT
  USING (
    episode_id IN (
      SELECT id FROM ai_episodes WHERE show_id IN (
        SELECT id FROM show_configs WHERE owner_id = auth.uid()
      )
    )
  );

-- Analytics: Users can only access analytics for their episodes
ALTER TABLE episode_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_access_own_analytics"
  ON episode_analytics
  FOR SELECT
  USING (
    episode_id IN (
      SELECT id FROM ai_episodes WHERE show_id IN (
        SELECT id FROM show_configs WHERE owner_id = auth.uid()
      )
    )
  );

-- Audit Logs: Users can only see audit logs for their show
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_access_own_audit_logs"
  ON audit_logs
  FOR SELECT
  USING (
    show_id IN (
      SELECT id FROM show_configs WHERE owner_id = auth.uid()
    )
  );

-- ============ FUNCTIONS & TRIGGERS ============

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audio_files_updated_at BEFORE UPDATE ON audio_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER transcripts_updated_at BEFORE UPDATE ON transcripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER video_clips_updated_at BEFORE UPDATE ON video_clips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Aggregate analytics into performance_metrics
CREATE OR REPLACE FUNCTION refresh_performance_metrics(episode_uuid UUID)
RETURNS VOID AS $$
DECLARE
  total_v INTEGER;
  total_eng INTEGER;
  avg_watch DECIMAL;
  virality DECIMAL;
  top_plat TEXT;
BEGIN
  SELECT 
    COALESCE(SUM(views), 0),
    COALESCE(SUM(likes + comments + shares), 0),
    COALESCE(AVG(watch_time_seconds), 0)
  INTO total_v, total_eng, avg_watch
  FROM episode_analytics
  WHERE episode_id = episode_uuid;

  SELECT platform INTO top_plat
  FROM episode_analytics
  WHERE episode_id = episode_uuid
  ORDER BY views DESC
  LIMIT 1;

  virality := (total_v * 0.5) + (total_eng * 1.5);

  INSERT INTO performance_metrics (episode_id, total_views, total_engagement, average_watch_time, virality_index, top_platform, last_updated)
  VALUES (episode_uuid, total_v, total_eng, avg_watch, virality, top_plat, NOW())
  ON CONFLICT (episode_id) DO UPDATE SET
    total_views = EXCLUDED.total_views,
    total_engagement = EXCLUDED.total_engagement,
    average_watch_time = EXCLUDED.average_watch_time,
    virality_index = EXCLUDED.virality_index,
    top_platform = EXCLUDED.top_platform,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============ GRANTS ============
GRANT SELECT ON audio_files TO authenticated;
GRANT SELECT ON transcripts TO authenticated;
GRANT SELECT ON video_clips TO authenticated;
GRANT SELECT ON episode_analytics TO authenticated;
GRANT SELECT ON performance_metrics TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;
GRANT INSERT ON audit_logs TO authenticated;
