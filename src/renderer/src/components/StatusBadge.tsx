import { Badge } from '@mantine/core'
import { PaperStatus } from '@shared/types'
import { statusMeta } from './paperStatus'

export function StatusBadge({ status }: { status: PaperStatus }) {
  const m = statusMeta(status)
  return (
    <Badge color={m.color} variant="light" size="sm">
      {m.label}
    </Badge>
  )
}
