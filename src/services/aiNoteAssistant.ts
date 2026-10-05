import { supabase } from './supabaseClient'

export const MAX_NOTE_INPUT_LENGTH = 12_000

export type NoteAssistantAction = 'summarize' | 'draft'

export interface NoteAssistantRequest {
  action: NoteAssistantAction
  text: string
}

export interface NoteAssistantResult {
  draft: string
}

export function validateNoteAssistantRequest(request: NoteAssistantRequest): void {
  if (request.action !== 'summarize' && request.action !== 'draft') {
    throw new Error('Choose a supported note action.')
  }
  if (typeof request.text !== 'string' || !request.text.trim()) {
    throw new Error('Enter text to summarize or organize.')
  }
  if (request.text.length > MAX_NOTE_INPUT_LENGTH) {
    throw new Error(`Input must be ${MAX_NOTE_INPUT_LENGTH.toLocaleString()} characters or fewer.`)
  }
}

export async function generateAdministrativeNote(
  request: NoteAssistantRequest,
): Promise<NoteAssistantResult> {
  validateNoteAssistantRequest(request)
  if (!supabase) {
    throw new Error('AI note assistance requires a configured Supabase project and signed-in account.')
  }

  const { data, error } = await supabase.functions.invoke('ai-note-assistant', { body: request })
  if (error) {
    try {
      const response = error.context as Response | undefined
      const responseBody: unknown = response ? await response.json() : null
      if (
        responseBody &&
        typeof responseBody === 'object' &&
        'error' in responseBody &&
        typeof responseBody.error === 'string'
      ) {
        throw new Error(responseBody.error)
      }
    } catch (responseError) {
      if (responseError instanceof Error && responseError.message !== error.message) {
        throw responseError
      }
    }
    throw new Error(error.message || 'Unable to generate a draft. Please try again.')
  }

  if (!data || typeof data.draft !== 'string' || !data.draft.trim()) {
    throw new Error('The AI service returned an invalid draft.')
  }
  return { draft: data.draft }
}
