import { Check, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PostPoll as PostPollModel } from '../../types/models'
import { getErrorMessage } from '../../utils/errors'

export interface PostPollVoteInput {
  pollId: string
  optionId: string
  userId: string
}

export interface PostPollProps {
  poll: PostPollModel
  currentUserId: string
  onVote: (input: PostPollVoteInput) => Promise<void>
  onVoteError?: (error: unknown) => void
  onExpire?: () => void
}

type PollScopedOption = {
  pollId: string
  optionId: string
  userId: string
}

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const pollDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function pluralized(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`
}

function remainingTimeLabel(remainingMs: number) {
  if (remainingMs <= 0) return 'Enquete encerrada'
  if (remainingMs >= DAY_MS) {
    const days = Math.ceil(remainingMs / DAY_MS)
    return `Encerra em ${pluralized(days, 'dia', 'dias')}`
  }
  if (remainingMs >= HOUR_MS) {
    const hours = Math.ceil(remainingMs / HOUR_MS)
    return `Encerra em ${pluralized(hours, 'hora', 'horas')}`
  }
  if (remainingMs >= MINUTE_MS) {
    const minutes = Math.ceil(remainingMs / MINUTE_MS)
    return `Encerra em ${pluralized(minutes, 'minuto', 'minutos')}`
  }

  const seconds = Math.max(1, Math.ceil(remainingMs / SECOND_MS))
  return `Encerra em ${pluralized(seconds, 'segundo', 'segundos')}`
}

function votePercentage(voteCount: number, totalVotes: number) {
  if (totalVotes <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((voteCount / totalVotes) * 100)))
}

export function PostPoll({ poll, currentUserId, onVote, onVoteError, onExpire }: PostPollProps) {
  const expiresAtMs = Date.parse(poll.expiresAt)
  const [now, setNow] = useState(() => Date.now())
  const [pendingVote, setPendingVote] = useState<PollScopedOption | null>(null)
  const [localVote, setLocalVote] = useState<PollScopedOption | null>(null)
  const votingRef = useRef(false)
  const orderedOptions = useMemo(
    () => [...poll.options].sort((left, right) => left.position - right.position),
    [poll.options],
  )

  const validExpiration = Number.isFinite(expiresAtMs)
  const remainingMs = validExpiration ? Math.max(0, expiresAtMs - now) : 0
  const expired = !validExpiration || remainingMs <= 0
  const localOptionId = localVote?.pollId === poll.id && localVote.userId === currentUserId
    ? localVote.optionId
    : null
  const selectedOptionId = poll.viewerOptionId ?? localOptionId
  const applyingLocalVote = poll.viewerOptionId === null && localOptionId !== null
  const displayedTotalVotes = nonNegativeInteger(poll.totalVotes) + (applyingLocalVote ? 1 : 0)
  const showResults = expired || selectedOptionId !== null
  const voting = pendingVote?.pollId === poll.id && pendingVote.userId === currentUserId
  const expirationKey = `${poll.id}:${poll.expiresAt}`
  const expirationRef = useRef({ key: expirationKey, wasExpired: expired, notified: false })

  useEffect(() => {
    if (expired) return

    const cadence = remainingMs <= MINUTE_MS ? SECOND_MS : MINUTE_MS
    const delay = Math.max(25, Math.min(cadence, remainingMs + 25))
    const timeout = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timeout)
  }, [expired, remainingMs])

  useEffect(() => {
    if (expirationRef.current.key !== expirationKey) {
      expirationRef.current = { key: expirationKey, wasExpired: expired, notified: false }
      return
    }

    if (!expirationRef.current.wasExpired && expired && !expirationRef.current.notified) {
      expirationRef.current.notified = true
      onExpire?.()
    }
    expirationRef.current.wasExpired = expired
  }, [expirationKey, expired, onExpire])

  function reportVoteError(error: unknown) {
    if (onVoteError) {
      onVoteError(error)
      return
    }
    toast.error(getErrorMessage(error, 'Não foi possível registrar seu voto.'))
  }

  async function vote(optionId: string) {
    if (votingRef.current || expired || selectedOptionId !== null) return
    if (!currentUserId) {
      reportVoteError(new Error('Entre na sua conta para votar nesta enquete.'))
      return
    }

    votingRef.current = true
    const userId = currentUserId
    setPendingVote({ pollId: poll.id, optionId, userId })
    try {
      await onVote({ pollId: poll.id, optionId, userId })
      setLocalVote({ pollId: poll.id, optionId, userId })
    } catch (error) {
      if (error instanceof Error && /encerr|expir/i.test(error.message)) {
        setNow(Math.max(Date.now(), expiresAtMs))
      }
      reportVoteError(error)
    } finally {
      votingRef.current = false
      setPendingVote((current) => current?.pollId === poll.id ? null : current)
    }
  }

  const expirationTitle = validExpiration
    ? pollDateFormatter.format(new Date(expiresAtMs))
    : undefined

  return (
    <section className="post-poll" aria-labelledby={`poll-${poll.id}-question`} aria-busy={voting}>
      <h3 id={`poll-${poll.id}-question`} className="post-poll-question">{poll.question}</h3>

      {showResults ? (
        <ol className="post-poll-options post-poll-results" aria-label="Resultado da enquete">
          {orderedOptions.map((option) => {
            const selected = option.id === selectedOptionId
            const optionVotes = nonNegativeInteger(option.voteCount) + (
              applyingLocalVote && selected ? 1 : 0
            )
            const percentage = votePercentage(optionVotes, displayedTotalVotes)

            return (
              <li className={`post-poll-result${selected ? ' is-selected' : ''}`} key={option.id}>
                <div className="post-poll-result-label">
                  <span>
                    {selected && <Check aria-hidden="true" />}
                    {option.text}
                  </span>
                  <strong>{percentage}%</strong>
                </div>
                <div
                  className="post-poll-progress"
                  role="progressbar"
                  aria-label={`${option.text}: ${percentage}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percentage}
                >
                  <span className="post-poll-progress-value" style={{ width: `${percentage}%` }} />
                </div>
                <span className="sr-only">
                  {selected ? 'Sua escolha. ' : ''}
                  {pluralized(optionVotes, 'voto', 'votos')} nesta opção.
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <fieldset className="post-poll-options" disabled={voting}>
          <legend className="sr-only">Escolha uma opção</legend>
          {orderedOptions.map((option) => {
            const optionPending = pendingVote?.pollId === poll.id
              && pendingVote.userId === currentUserId
              && pendingVote.optionId === option.id
            return (
              <button
                type="button"
                className="post-poll-option"
                key={option.id}
                onClick={() => void vote(option.id)}
                aria-busy={optionPending}
              >
                <span>{option.text}</span>
                {optionPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              </button>
            )
          })}
        </fieldset>
      )}

      <footer className="post-poll-meta">
        <span>{pluralized(displayedTotalVotes, 'voto', 'votos')}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={poll.expiresAt} title={expirationTitle}>
          {remainingTimeLabel(remainingMs)}
        </time>
      </footer>
      <span className="sr-only" role="status" aria-live="polite">
        {voting ? 'Registrando voto.' : expired ? 'A enquete foi encerrada.' : ''}
      </span>
    </section>
  )
}
