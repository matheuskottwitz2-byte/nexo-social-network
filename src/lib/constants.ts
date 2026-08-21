export const POST_MAX_LENGTH = 500
export const POST_MEDIA_MAX_ITEMS = 4
export const POST_MEDIA_MAX_SOURCE_BYTES = 8 * 1024 * 1024
export const POST_MEDIA_MAX_DIMENSION = 1920
export const POST_MEDIA_ALT_MAX_LENGTH = 1000
export const POLL_QUESTION_MAX_LENGTH = 280
export const POLL_OPTION_MAX_LENGTH = 80
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 4
export const POLL_DURATION_OPTIONS = [
  { minutes: 60, label: '1 hora' },
  { minutes: 360, label: '6 horas' },
  { minutes: 1440, label: '1 dia' },
  { minutes: 4320, label: '3 dias' },
  { minutes: 10080, label: '7 dias' },
] as const
export const COMMENT_MAX_LENGTH = 500
export const PROFILE_NAME_MAX_LENGTH = 80
export const PROFILE_BIO_MAX_LENGTH = 280
export const USERNAME_MAX_LENGTH = 30
