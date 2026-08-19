import type { ImageCropMode } from './imageProcessing'

export const PROFILE_MEDIA_RULES = {
  avatar: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    maxBytes: 5 * 1024 * 1024,
  },
  cover: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
    maxBytes: 8 * 1024 * 1024,
  },
} as const satisfies Record<ImageCropMode, { mimeTypes: readonly string[]; maxBytes: number }>

export function validateProfileMediaFile(file: File, mode: ImageCropMode): string | null {
  if (file.size <= 0) return 'O arquivo de imagem está vazio.'

  const mimeType = file.type.toLowerCase()
  if (mode === 'avatar' && mimeType === 'image/gif') {
    return 'GIF não é aceito como foto de perfil. Use JPG, PNG, WebP ou AVIF.'
  }

  const allowedMimeTypes: readonly string[] = PROFILE_MEDIA_RULES[mode].mimeTypes
  if (!allowedMimeTypes.includes(mimeType)) {
    return mode === 'avatar'
      ? 'Use uma imagem JPG, PNG, WebP ou AVIF.'
      : 'Use uma capa JPG, PNG, WebP, AVIF ou GIF.'
  }

  if (file.size > PROFILE_MEDIA_RULES[mode].maxBytes) {
    return mode === 'avatar'
      ? 'A imagem deve ter no máximo 5 MB.'
      : 'A capa deve ter no máximo 8 MB.'
  }

  return null
}
