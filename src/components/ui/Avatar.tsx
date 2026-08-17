import type { ImgHTMLAttributes } from 'react'
import { initials } from '../../utils/format'

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Avatar({ src, name, size = 'md', className = '', ...props }: AvatarProps) {
  if (src) {
    return <img src={src} alt={`Avatar de ${name}`} className={`avatar avatar-${size} ${className}`} {...props} />
  }
  return (
    <span className={`avatar avatar-${size} avatar-fallback ${className}`} role="img" aria-label={`Avatar de ${name}`}>
      {initials(name)}
    </span>
  )
}
