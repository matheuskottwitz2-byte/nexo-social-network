import { useMemo, useState } from 'react'
import type { PostMedia } from '../../types/models'
import { MediaViewer } from './MediaViewer'

interface PostMediaGridProps {
  media: readonly PostMedia[]
  eager?: boolean
}

function validDimension(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

const gridFrameAspectRatios: Record<number, readonly number[]> = {
  2: [4 / 5, 2 / 3],
  3: [16 / 15, 8 / 9],
  4: [8 / 5, 4 / 3],
}

function shouldContainInGrid(media: PostMedia, mediaCount: number) {
  if (!validDimension(media.width) || !validDimension(media.height)) return false
  const sourceRatio = media.width / media.height
  return (gridFrameAspectRatios[mediaCount] ?? []).some((frameRatio) => (
    Math.max(sourceRatio / frameRatio, frameRatio / sourceRatio) > 1.5
  ))
}

export function PostMediaGrid({ media, eager = false }: PostMediaGridProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const orderedMedia = useMemo(
    () => [...media].sort((left, right) => left.position - right.position).slice(0, 4),
    [media],
  )
  const activeIndex = viewerIndex !== null && viewerIndex < orderedMedia.length
    ? viewerIndex
    : null

  if (orderedMedia.length === 0) return null

  return (
    <>
      <div
        className={`post-media-grid post-media-grid-${orderedMedia.length}`}
        role="group"
        aria-label={`Imagens da publicação (${orderedMedia.length})`}
      >
        {orderedMedia.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`post-media-tile post-media-tile-${index + 1}${
              orderedMedia.length > 1 && shouldContainInGrid(item, orderedMedia.length) ? ' uses-contain' : ''
            }`}
            style={orderedMedia.length === 1 && validDimension(item.width) && validDimension(item.height)
              ? { aspectRatio: `${item.width} / ${item.height}` }
              : undefined}
            aria-label={item.altText
              ? `Abrir imagem ${index + 1} de ${orderedMedia.length}: ${item.altText}`
              : `Abrir imagem ${index + 1} de ${orderedMedia.length}`}
            aria-haspopup="dialog"
            onClick={() => setViewerIndex(index)}
          >
            <img
              className="post-media-image"
              src={item.url}
              alt={item.altText ?? ''}
              width={validDimension(item.width) ? item.width : undefined}
              height={validDimension(item.height) ? item.height : undefined}
              loading={eager && index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </button>
        ))}
      </div>

      {activeIndex !== null && (
        <MediaViewer
          media={orderedMedia}
          index={activeIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  )
}
