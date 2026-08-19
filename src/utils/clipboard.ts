export type ClipboardImageErrorCode = 'unsupported' | 'denied' | 'empty' | 'read-failed' | 'timeout'

const ERROR_MESSAGES: Record<ClipboardImageErrorCode, string> = {
  unsupported: 'Seu navegador não oferece suporte à leitura de imagens da área de transferência.',
  denied: 'O navegador não permitiu acessar a área de transferência.',
  empty: 'Não encontramos uma imagem na área de transferência.',
  'read-failed': 'Não foi possível ler a imagem da área de transferência.',
  timeout: 'O navegador demorou para liberar a área de transferência.',
}

const CLIPBOARD_READ_TIMEOUT_MS = 900

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export class ClipboardImageError extends Error {
  readonly code: ClipboardImageErrorCode

  constructor(code: ClipboardImageErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = 'ClipboardImageError'
    this.code = code
  }
}

type ImageCandidate = {
  item: ClipboardItem
  sourceType: string
  mimeType: string
  preferred: boolean
}

function clipboardFile(blob: Blob, mimeType: string, originalName?: string): File {
  const normalizedMimeType = (blob.type || mimeType).toLowerCase()
  const extension = EXTENSION_BY_MIME[normalizedMimeType] || 'image'
  return new File([blob], originalName || `clipboard-${Date.now()}.${extension}`, {
    type: normalizedMimeType,
    lastModified: Date.now(),
  })
}

function isPermissionError(error: unknown) {
  return error instanceof DOMException && (
    error.name === 'NotAllowedError' ||
    error.name === 'SecurityError'
  )
}

function isUnsupportedError(error: unknown) {
  return error instanceof TypeError || (
    error instanceof DOMException && error.name === 'NotSupportedError'
  )
}

type ClipboardReadResult =
  | { status: 'success'; items: ClipboardItems }
  | { status: 'error'; error: unknown }
  | { status: 'timeout' }

export async function readClipboardImage(preferredMimeTypes: readonly string[]): Promise<File> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') {
    throw new ClipboardImageError('unsupported')
  }

  let readRequest: Promise<ClipboardItems>
  try {
    readRequest = navigator.clipboard.read()
  } catch (error) {
    if (isPermissionError(error)) throw new ClipboardImageError('denied')
    if (isUnsupportedError(error)) throw new ClipboardImageError('unsupported')
    throw new ClipboardImageError('read-failed')
  }

  const clipboardRequest = readRequest.then<ClipboardReadResult, ClipboardReadResult>(
    (items) => ({ status: 'success', items }),
    (error: unknown) => ({ status: 'error', error }),
  )
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<ClipboardReadResult>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: 'timeout' }), CLIPBOARD_READ_TIMEOUT_MS)
  })
  const result = await Promise.race([clipboardRequest, timeout])
  if (timeoutId !== undefined) clearTimeout(timeoutId)

  if (result.status === 'timeout') throw new ClipboardImageError('timeout')
  if (result.status === 'error') {
    if (isPermissionError(result.error)) throw new ClipboardImageError('denied')
    if (isUnsupportedError(result.error)) throw new ClipboardImageError('unsupported')
    throw new ClipboardImageError('read-failed')
  }

  const { items } = result

  const preferred = new Set(preferredMimeTypes.map((type) => type.toLowerCase()))
  const candidates: ImageCandidate[] = []

  for (const item of items) {
    for (const type of item.types) {
      const mimeType = type.toLowerCase()
      if (!mimeType.startsWith('image/')) continue
      candidates.push({ item, sourceType: type, mimeType, preferred: preferred.has(mimeType) })
    }
  }

  if (candidates.length === 0) throw new ClipboardImageError('empty')

  candidates.sort((left, right) => Number(right.preferred) - Number(left.preferred))

  for (const candidate of candidates) {
    try {
      const blob = await candidate.item.getType(candidate.sourceType)
      const mimeType = (blob.type || candidate.mimeType).toLowerCase()
      return clipboardFile(blob, mimeType)
    } catch {
      // Some browsers expose a type that cannot be read. Try the next image.
    }
  }

  throw new ClipboardImageError('read-failed')
}

export function readPastedImage(clipboardData: DataTransfer | null): File {
  if (!clipboardData) throw new ClipboardImageError('empty')

  for (const item of clipboardData.items) {
    const mimeType = item.type.toLowerCase()
    if (item.kind !== 'file' || !mimeType.startsWith('image/')) continue

    const file = item.getAsFile()
    if (file) return clipboardFile(file, mimeType, file.name || undefined)
  }

  for (const file of clipboardData.files) {
    const mimeType = file.type.toLowerCase()
    if (mimeType.startsWith('image/')) {
      return clipboardFile(file, mimeType, file.name || undefined)
    }
  }

  throw new ClipboardImageError('empty')
}

export function shouldUseManualPasteFallback(error: unknown) {
  return error instanceof ClipboardImageError && error.code !== 'empty'
}
