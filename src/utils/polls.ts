import {
  POLL_DURATION_OPTIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LENGTH,
  POLL_QUESTION_MAX_LENGTH,
} from '../lib/constants'
import type { CreatePollInput } from '../types/models'

export type PollValidationResult =
  | { valid: true; poll: CreatePollInput }
  | { valid: false; error: string }

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function validatePollInput(input: CreatePollInput): PollValidationResult {
  const question = normalizeText(input.question)
  if (!question) return { valid: false, error: 'Escreva uma pergunta para a enquete.' }
  if (question.length > POLL_QUESTION_MAX_LENGTH) {
    return {
      valid: false,
      error: `A pergunta pode ter no máximo ${POLL_QUESTION_MAX_LENGTH} caracteres.`,
    }
  }

  if (input.options.length < POLL_MIN_OPTIONS || input.options.length > POLL_MAX_OPTIONS) {
    return {
      valid: false,
      error: `A enquete precisa ter entre ${POLL_MIN_OPTIONS} e ${POLL_MAX_OPTIONS} opções.`,
    }
  }

  const options = input.options.map(normalizeText)
  if (options.some((option) => !option)) {
    return { valid: false, error: 'Preencha todas as opções da enquete.' }
  }
  if (options.some((option) => option.length > POLL_OPTION_MAX_LENGTH)) {
    return {
      valid: false,
      error: `Cada opção pode ter no máximo ${POLL_OPTION_MAX_LENGTH} caracteres.`,
    }
  }

  const normalizedForComparison = options.map((option) => option.toLocaleLowerCase('pt-BR'))
  if (new Set(normalizedForComparison).size !== normalizedForComparison.length) {
    return { valid: false, error: 'As opções da enquete precisam ser diferentes.' }
  }

  const durationIsAllowed = POLL_DURATION_OPTIONS.some(
    ({ minutes }) => minutes === input.durationMinutes,
  )
  if (!durationIsAllowed) return { valid: false, error: 'Escolha uma duração válida para a enquete.' }

  return {
    valid: true,
    poll: { question, options, durationMinutes: input.durationMinutes },
  }
}
