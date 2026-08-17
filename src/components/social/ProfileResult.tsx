import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ProfileSummary } from '../../types/models'
import { Avatar } from '../ui/Avatar'

export function ProfileResult({ profile, compact = false }: { profile: ProfileSummary; compact?: boolean }) {
  return (
    <Link to={`/@${profile.username}`} className={`profile-result ${compact ? 'compact' : ''}`}>
      <Avatar name={profile.name} src={profile.avatarUrl} size={compact ? 'sm' : 'md'} />
      <span className="min-w-0 flex-1">
        <strong>{profile.name}</strong>
        <small>@{profile.username}</small>
      </span>
      <ArrowUpRight className="size-4 result-arrow" aria-hidden="true" />
    </Link>
  )
}
