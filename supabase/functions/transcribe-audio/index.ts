// ============================================================================
// TRANSCRIBE AUDIO - Convert audio files to transcripts using Deepgram API
// ============================================================================

import { createEdgeFunctionHandler, validateRequired, withTimeout, successResponse, errorResponse, logError, logAuditEvent, EdgeFunctionContext } from '../_edge-utils/index.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY') || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface TranscribeRequest {
  audio_file_id: string
  show_id: string
}

export const transcribeAudio = async (request: Request, context: EdgeFunctionContext): Promise<Response> => {
  try {
    const body = await request.json() as TranscribeRequest

    // ============ VALIDATION ============
    const errors = validateRequired(body, ['audio_file_id', 'show_id'])
    if (errors.length > 0) {
      return errorResponse(`Validation failed: ${errors.join(', ')}`, 'VALIDATION_ERROR', 400)
    }

    // ============ FETCH AUDIO FILE ============
    const { data: audioFile, error: audioError } = await supabase
      .from('audio_files')
      .select('*')
      .eq('id', body.audio_file_id)
      .eq('show_id', body.show_id)
      .single()

    if (audioError || !audioFile) {
      return errorResponse('Audio file not found', 'NOT_FOUND', 404)
    }

    if (audioFile.status !== 'uploaded') {
      return errorResponse(`Audio file status is ${audioFile.status}, expected uploaded`, 'INVALID_STATUS', 400)
    }

    // ============ UPDATE STATUS TO TRANSCRIBING ============
    await supabase
      .from('audio_files')
      .update({ status: 'transcribing' })
      .eq('id', body.audio_file_id)

    // ============ CALL DEEPGRAM API WITH TIMEOUT ============
    let transcript: unknown
    try {
      const response = await withTimeout(
        fetch('https://api.deepgram.com/v1/listen', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: audioFile.s3_url,
            model: 'nova-2',
            smart_format: true,
            filler_words: false,
            punctuate: true,
            paragraphs: true,
          }),
        }),
        30000,
        'Deepgram transcription request'
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Deepgram API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`)
      }

      transcript = await response.json()
    } catch (apiError) {
      logError('Deepgram API call failed', apiError, { audio_file_id: body.audio_file_id })
      
      // Update status to failed
      await supabase
        .from('audio_files')
        .update({ status: 'failed', error_msg: apiError instanceof Error ? apiError.message : 'Unknown error' })
        .eq('id', body.audio_file_id)

      return errorResponse('Transcription failed', 'DEEPGRAM_ERROR', 500)
    }

    // ============ PARSE TRANSCRIPT ============
    const deepgramData = transcript as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } }
    const fullText = deepgramData.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    
    if (!fullText) {
      return errorResponse('No transcript found in response', 'EMPTY_TRANSCRIPT', 400)
    }

    // ============ SAVE TRANSCRIPT ============
    const { data: savedTranscript, error: saveError } = await supabase
      .from('transcripts')
      .insert([{
        audio_id: body.audio_file_id,
        full_text: fullText,
        segments: [], // Will be populated later if needed
        language: 'en',
        word_count: fullText.split(/\s+/).length,
      }])
      .select()
      .single()

    if (saveError) {
      logError('Failed to save transcript', saveError, { audio_file_id: body.audio_file_id })
      await supabase
        .from('audio_files')
        .update({ status: 'failed', error_msg: 'Failed to save transcript' })
        .eq('id', body.audio_file_id)

      return errorResponse('Failed to save transcript', 'DB_ERROR', 500)
    }

    // ============ UPDATE AUDIO FILE STATUS ============
    await supabase
      .from('audio_files')
      .update({ status: 'transcribed' })
      .eq('id', body.audio_file_id)

    // ============ LOG AUDIT EVENT ============
    await logAuditEvent({
      show_id: body.show_id,
      user_id: context.userId,
      action: 'create',
      entity_type: 'audio_file',
      entity_id: body.audio_file_id,
      after_state: { status: 'transcribed', word_count: savedTranscript.word_count },
    })

    return successResponse(savedTranscript, 200)
  } catch (error) {
    logError('Transcribe audio handler error', error, { userId: context.userId })
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ============ EXPORT HANDLER ============
export default createEdgeFunctionHandler(transcribeAudio)
