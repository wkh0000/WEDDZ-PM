import Badge from '@/components/ui/Badge'

const map = {
  draft:     { tone: 'default', label: 'Draft' },
  sent:      { tone: 'indigo',  label: 'Sent' },
  paid:      { tone: 'emerald', label: 'Paid' },
  overdue:   { tone: 'rose',    label: 'Overdue' },
  cancelled: { tone: 'zinc',    label: 'Cancelled' }
}

export function invoiceStatusBadge(status) {
  const m = map[status] ?? { tone: 'default', label: status ?? 'Unknown' }
  return <Badge tone={m.tone} dot>{m.label}</Badge>
}

export const INVOICE_STATUSES = [
  { value: 'draft',     label: 'Draft' },
  { value: 'sent',      label: 'Sent' },
  { value: 'paid',      label: 'Paid' },
  { value: 'overdue',   label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' }
]
