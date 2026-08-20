import {
  POST_MEDIA_MAX_DIMENSION,
  POST_MEDIA_MAX_SOURCE_BYTES,
} from '../lib/constants'

export type ImageCropMode = 'avatar' | 'cover'

export interface CroppedAreaPixels {
  x: number
  y: number
  width: number
  height: number
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  dispose: () => void
}

const OUTPUT_CONFIG: Record<
  ImageCropMode,
  { width: number; height: number; quality: number }
> = {
  avatar: { width: 512, height: 512, quality: 0.88 },
  cover: { width: 1500, height: 500, quality: 0.86 },
}

export const POST_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export type PostImageMimeType = (typeof POST_IMAGE_MIME_TYPES)[number]

export interface ProcessedPostImage {
  file: File
  width: number
  height: number
}

const POST_IMAGE_QUALITY = 0.88
const POST_IMAGE_MAX_DATABASE_DIMENSION = 32768

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function fileNameFor(originalName: string, mode: ImageCropMode) {
  const stem = originalName
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${stem || mode}.webp`
}

function postImageFileName(originalName: string, extension: string) {
  const stem = originalName
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${stem || 'imagem'}.${extension}`
}

async function decodeWithImageElement(file: File): Promise<DecodedImage> {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'))
      image.src = objectUrl
    })

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => {
        image.onload = null
        image.onerror = null
        image.src = ''
        URL.revokeObjectURL(objectUrl)
      },
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      }
    } catch {
      // The image element fallback covers browsers and formats unsupported by ImageBitmap.
    }
  }

  return decodeWithImageElement(file)
}

function canvasToWebP(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/webp') {
          resolve(blob)
          return
        }

        reject(new Error(
          blob
            ? 'Seu navegador não oferece suporte à geração de imagens WebP.'
            : 'Não foi possível gerar a imagem recortada.',
        ))
      },
      'image/webp',
      quality,
    )
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === type) {
          resolve(blob)
          return
        }
        reject(new Error('Não foi possível otimizar esta imagem neste navegador.'))
      },
      type,
      quality,
    )
  })
}

function isPostImageMimeType(value: string): value is PostImageMimeType {
  return (POST_IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

export function validatePostImageFile(file: File): string | null {
  const mimeType = file.type.toLowerCase()
  if (!isPostImageMimeType(mimeType)) {
    if (mimeType === 'image/gif') {
      return 'GIF ainda não é aceito em publicações. Use JPEG, PNG, WebP ou AVIF.'
    }
    return 'Use uma imagem JPEG, PNG, WebP ou AVIF.'
  }
  if (file.size <= 0) return 'A imagem selecionada está vazia.'
  if (file.size > POST_MEDIA_MAX_SOURCE_BYTES) {
    return 'Cada imagem pode ter no máximo 8 MiB antes da otimização.'
  }
  return null
}

/**
 * Decodes the source with its embedded orientation, keeps the original aspect
 * ratio and reduces only images whose largest side is above the post limit.
 * WebP is preferred; browsers without a WebP encoder retain a small original
 * or receive a resized JPEG/PNG fallback without mislabelling the bytes.
 */
export async function processPostImage(file: File): Promise<ProcessedPostImage> {
  const validationError = validatePostImageFile(file)
  if (validationError) throw new Error(validationError)

  const decoded = await decodeImage(file)
  try {
    if (!isFinitePositive(decoded.width) || !isFinitePositive(decoded.height)) {
      throw new Error('A imagem selecionada não possui dimensões válidas.')
    }
    if (
      decoded.width > POST_IMAGE_MAX_DATABASE_DIMENSION ||
      decoded.height > POST_IMAGE_MAX_DATABASE_DIMENSION
    ) {
      throw new Error('As dimensões desta imagem são grandes demais para uma publicação.')
    }

    const scale = Math.min(1, POST_MEDIA_MAX_DIMENSION / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Seu navegador não conseguiu preparar esta imagem.')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height, 0, 0, width, height)

      let outputBlob: Blob
      let outputName: string

      try {
        outputBlob = await canvasToWebP(canvas, POST_IMAGE_QUALITY)
        outputName = postImageFileName(file.name, 'webp')
      } catch {
        if (scale === 1) {
          return { file, width, height }
        }

        const fallbackType = file.type.toLowerCase() === 'image/jpeg' ? 'image/jpeg' : 'image/png'
        outputBlob = await canvasToBlob(
          canvas,
          fallbackType,
          fallbackType === 'image/jpeg' ? POST_IMAGE_QUALITY : undefined,
        )
        outputName = postImageFileName(file.name, fallbackType === 'image/jpeg' ? 'jpg' : 'png')
      }

      if (outputBlob.size > POST_MEDIA_MAX_SOURCE_BYTES) {
        throw new Error('A imagem otimizada ainda excede o limite de 8 MiB.')
      }

      return {
        file: new File([outputBlob], outputName, {
          type: outputBlob.type,
          lastModified: Date.now(),
        }),
        width,
        height,
      }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    decoded.dispose()
  }
}

/**
 * Applies the pixel crop returned by react-easy-crop and creates a fixed-size
 * WebP file. The canvas remains transparent, so alpha is preserved when the
 * source image contains it.
 */
export async function createCroppedImageFile(
  file: File,
  croppedAreaPixels: CroppedAreaPixels,
  mode: ImageCropMode,
) {
  const mimeType = file.type.toLowerCase()
  if (!mimeType.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.')
  }

  if (mimeType === 'image/gif') {
    throw new Error('GIF não é aceito no recorte. Selecione JPG, PNG, WebP ou AVIF.')
  }

  const { x, y, width, height } = croppedAreaPixels
  if (![x, y].every(Number.isFinite) || !isFinitePositive(width) || !isFinitePositive(height)) {
    throw new Error('A área de recorte não é válida. Ajuste a imagem e tente novamente.')
  }

  const decoded = await decodeImage(file)

  try {
    if (!isFinitePositive(decoded.width) || !isFinitePositive(decoded.height)) {
      throw new Error('A imagem selecionada não possui dimensões válidas.')
    }

    const sourceX = clamp(Math.round(x), 0, Math.max(decoded.width - 1, 0))
    const sourceY = clamp(Math.round(y), 0, Math.max(decoded.height - 1, 0))
    const sourceWidth = clamp(Math.round(width), 1, decoded.width - sourceX)
    const sourceHeight = clamp(Math.round(height), 1, decoded.height - sourceY)
    const output = OUTPUT_CONFIG[mode]
    const canvas = document.createElement('canvas')
    canvas.width = output.width
    canvas.height = output.height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Seu navegador não conseguiu preparar o recorte da imagem.')
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      decoded.source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      output.width,
      output.height,
    )

    const blob = await canvasToWebP(canvas, output.quality)
    return new File([blob], fileNameFor(file.name, mode), {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } finally {
    decoded.dispose()
  }
}
