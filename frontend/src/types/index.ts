export type ShowName =
  | 'sunday_power_hour'
  | 'motivation_court'
  | 'tea_time_with_cj'
  | 'confession_court'

export type ScriptStatus = 'draft' | 'ready' | 'processing' | 'done' | 'failed' | 'scripting'
export type EpisodeStatus = 'generating' | 'processing' | 'complete' | 'failed' | 'cancelled'
export type EpisodeSource = 'nova' | 'heygen_studio'

export interface ShowConfig {
  id: string; show_name: ShowName; display_name: string; description: string
  color: string; voice_id: string; avatar_id: string; heygen_voice_id: string
  background_url: string; day_of_week: string; fal_model?: string
  thumbnail_style?: string; voice_clone_id?: string | null; created_at: string
}

export interface ShowScript {
  id: string; show_id: string; script_text: string; caption: string
  status: ScriptStatus; part_title: string; series_topic: string
  series_part: number | null; post_date: string | null; post_time_utc: string
  created_at: string; show?: ShowConfig
}

export interface AiEpisode {
  id: string; script_id: string | null; show_name: string; audio_url: string
  heygen_video_url: string; heygen_video_id: string; heygen_thumbnail_url: string
  heygen_title: string; heygen_duration: string; storage_url: string
  thumbnail_url: string; podcast_audio_url: string; episode_title: string
  status: EpisodeStatus; source: EpisodeSource; social_content_id?: string | null
  error_msg?: string; created_at: string; script?: ShowScript
}

export interface HeyGenVideo {
  video_id: string; title: string; status: string; video_url: string
  thumbnail_url: string; duration: string; created_at: number
}

export interface NovaSocialContent {
  id: string; episode_id: string; script_id: string | null; show_name: string
  episode_title: string; hook: string; caption: string; hashtags: string[]
  cta: string; tiktok_copy: string; instagram_copy: string
  youtube_description: string; linkedin_copy: string; twitter_copy: string
  pinterest_copy: string; thumbnail_prompt: string; thumbnail_url: string
  social_card_url: string
  status: 'pending' | 'generating' | 'complete' | 'failed'
  error_msg?: string; created_at: string
}

export interface NovaStyleProfile {
  id: string; show_name: string; tone_tags: string[]; content_pillars: string[]
  vocabulary: string[]; avoid_words: string[]; style_prompt: string
  hook_patterns: string[]; cta_patterns: string[]; sample_scripts: string[]
  total_trained: number; last_trained_at: string | null; updated_at: string
}

export interface NovaVoiceClone {
  id: string; name: string; elevenlabs_voice_id: string; description: string
  sample_count: number; status: 'active' | 'training' | 'failed'
  is_default: boolean; created_at: string
}

export interface ProducePayload {
  script_id: string; show_name: string; voice_id: string; avatar_id: string
  heygen_voice_id: string; show_color: string; background_url: string
}
