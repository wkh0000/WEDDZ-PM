import Badge from '@/components/ui/Badge'

const map = {
  planning:  { tone: 'sky',     label: 'Planning' },
  active:    { tone: 'indigo',  label: 'Active' },
  on_hold:   { tone: 'amber',   label: 'On Hold' },
  completed: { tone: 'emerald', label: 'Completed' },
  cancelled: { tone: 'rose',    label: 'Cancelled' }
}

export function projectStatusBadge(status) {
  const m = map[status] ?? { tone: 'default', label: status ?? 'Unknown' }
  return <Badge tone={m.tone} dot>{m.label}</Badge>
}

export const PROJECT_STATUSES = [
  { value: 'planning',  label: 'Planning' },
  { value: 'active',    label: 'Active' },
  { value: 'on_hold',   label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
]
