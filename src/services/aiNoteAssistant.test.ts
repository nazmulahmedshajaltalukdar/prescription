import { describe, expect, it } from 'vitest'
import {
  MAX_NOTE_INPUT_LENGTH,
  validateNoteAssistantRequest,
} from './aiNoteAssistant'

describe('validateNoteAssistantRequest', () => {
  it('accepts supported actions with bounded text', () => {
    expect(() => validateNoteAssistantRequest({ action: 'summarize', text: 'Visit notes' })).not.toThrow()
    expect(() => validateNoteAssistantRequest({ action: 'draft', text: 'Visit notes' })).not.toThrow()
    expect(() =>
      validateNoteAssistantRequest({ action: 'draft', text: 'x'.repeat(MAX_NOTE_INPUT_LENGTH) }),
    ).not.toThrow()
  })

  it('rejects blank text, unsupported actions, and overlong input', () => {
    expect(() => validateNoteAssistantRequest({ action: 'draft', text: ' \n ' })).toThrow(/Enter text/)
    expect(() =>
      validateNoteAssistantRequest({
        action: 'draft',
        text: 'x'.repeat(MAX_NOTE_INPUT_LENGTH + 1),
      }),
    ).toThrow(/characters or fewer/)
    expect(() =>
      validateNoteAssistantRequest({ action: 'diagnose' as 'draft', text: 'Visit notes' }),
    ).toThrow(/supported note action/)
  })
})
