export type ShowName =
  | 'sunday_power_hour'
  | 'motivation_court'
  | 'tea_time_with_cj'
  | 'confession_court'

export type ScriptStatus = 'draft' | 'ready' | 'processing' | 'done' | 'failed'
export type EpisodeStatus = 'generating' | 'complete' | 'failed'
export type EpisodeSource = 'nova' | 'heygen_studio'

export interface ShowConfig {
  id: string
  show_name: ShowName
  display_name: string
  description: string
  color: string
  voice_id: string
  avatar_id: string
  heygen_voice_id: string
  background_url: string
  day_of_week: string
  created_at: string
}

export interface ShowScript {
  id: string
  show_id: string
  script_text: string
  caption: string
  status: ScriptStatus
  created_at: string
  show?: ShowConfig
}

export interface AiEpisode {
  id: string
  script_id: string | null
  show_name: string
  audio_url: string
  heygen_video_url: string
  heygen_thumbnail_url: string
  heygen_title: string
  heygen_duration: string
  storage_url: string
  status: EpisodeStatus
  source: EpisodeSource
  error_msg?: string
  created_at: string
  script?: ShowScript
}

export interface HeyGenVideo {
  video_id: string
  title: string
  status: string
  video_url: string
  thumbnail_url: string
  duration: string
  created_at: number
}

export interface ProducePayload {
  script_id: string
  show_name: string
  voice_id: string
  avatar_id: string
  heygen_voice_id: string
  show_color: string
  background_url: string
}
