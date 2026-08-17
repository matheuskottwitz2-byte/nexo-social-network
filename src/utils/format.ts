import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatRelativeDate(value: string): string {
  const date = parseISO(value)
  if (!isValid(date)) return ''
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: ptBR })
}

export function formatFullDate(value: string): string {
  const date = parseISO(value)
  if (!isValid(date)) return ''
  return format(date, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'N'
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
