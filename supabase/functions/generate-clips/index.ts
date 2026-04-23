// ============================================================================
// GENERATE CLIPS - Extract key moments from episodes and score virality
// ============================================================================

import { createEdgeFunctionHandler, validateRequired, withTimeout, successResponse, errorResponse, logError, logAuditEvent, EdgeFunctionContext } from '../_edge-utils/index.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface GenerateClipsRequest {
  episode_id: string
  show_id: string
  use_transcript: boolean
}

interface ClipCandidate {
  title: string
  start_time: number
  end_time: number
  virality_score: number
  key_moment: string
}

export const generateClips = async (request: Request, context: EdgeFunctionContext): Promise<Response> => {
  try {
    const body = await request.json() as GenerateClipsRequest

    // ============ VALIDATION ============
    const errors = validateRequired(body, ['episode_id', 'show_id'])
    if (errors.length > 0) {
      return errorResponse(`Validation failed: ${errors.join(', ')}`, 'VALIDATION_ERROR', 400)
    }

    // ============ FETCH EPISODE ============
    const { data: episode, error: episodeError } = await supabase
      .from('ai_episodes')
      .select('*, transcript:transcripts(*)')
      .eq('id', body.episode_id)
      .eq('show_id', body.show_id)
      .single()

    if (episodeError || !episode) {
      return errorResponse('Episode not found', 'NOT_FOUND', 404)
    }

    // ============ FETCH TRANSCRIPT IF USING ============
    let transcript = ''
    if (body.use_transcript) {
      const { data: transcriptData } = await supabase
        .from('transcripts')
        .select('full_text')
        .eq('episode_id', body.episode_id)
        .single()

      transcript = transcriptData?.full_text || ''
    }

    // ============ USE CLAUDE TO IDENTIFY KEY MOMENTS ============
    let clipCandidates: ClipCandidate[] = []
    
    if (transcript) {
      try {
        const response = await withTimeout(
          fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': claudeApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-opus-4-5',
              max_tokens: 2000,
              system: `You are an expert at identifying viral moments in podcast transcripts.
              
              Analyze the transcript and identify 3-5 key moments that would make great short-form video clips.
              
              For each moment, provide:
              1. A catchy 1-2 sentence title
              2. Estimated start time in seconds (0-indexed)
              3. Estimated end time in seconds (keep clips under 60 seconds)
              4. Virality score (1-10) based on emotional impact, humor, relevance, controversy
              5. Why this moment is viral-worthy
              
              Format as JSON array:
              [
                {
                  "title": "...",
                  "start_time": 0,
                  "end_time": 45,
                  "virality_score": 8,
                  "key_moment": "..."
                }
              ]
              
              Focus on moments with:
              - High emotional impact
              - Surprising reveals
              - Humor or relatability
              - Controversial or polarizing takes
              - Call-to-action moments`,
              messages: [
                {
                  role: 'user',
                  content: `Transcript:\n\n${transcript.slice(0, 4000)}...`, // First 4000 chars to fit in context
                },
              ],
            }),
          }),
          30000,
          'Claude API clip analysis'
        )

        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status}`)
        }

        const responseData = await response.json() as { content?: Array<{ text?: string }> }
        const analysisText = responseData.content?.[0]?.text || ''

        // Parse JSON from Claude response
        const jsonMatch = analysisText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ClipCandidate[]
          clipCandidates = parsed.filter(clip => 
            clip.title && typeof clip.start_time === 'number' && typeof clip.end_time === 'number'
          )
        }
      } catch (claudeError) {
        logError('Claude API call failed for clip analysis', claudeError)
        // Continue with empty clip candidates if Claude fails
      }
    }

    // ============ CREATE CLIP RECORDS ============
    const createdClips = []
    for (const candidate of clipCandidates) {
      const { data: clip, error: clipError } = await supabase
        .from('video_clips')
        .insert([{
          episode_id: body.episode_id,
          title: candidate.title,
          start_time: candidate.start_time * 1000, // Convert to milliseconds
          end_time: candidate.end_time * 1000,
          status: 'pending',
          virality_score: candidate.virality_score,
          key_moments: [candidate.key_moment],
        }])
        .select()
        .single()

      if (!clipError && clip) {
        createdClips.push(clip)
      }
    }

    // ============ LOG AUDIT EVENT ============
    await logAuditEvent({
      show_id: body.show_id,
      user_id: context.userId,
      action: 'create',
      entity_type: 'clip',
      entity_id: body.episode_id,
      after_state: { clip_count: createdClips.length },
    })

    return successResponse(
      {
        clips: createdClips,
        count: createdClips.length,
        message: `Generated ${createdClips.length} clip candidates`,
      },
      200
    )
  } catch (error) {
    logError('Generate clips handler error', error, { userId: context.userId })
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ============ EXPORT HANDLER ============
export default createEdgeFunctionHandler(generateClips)
