import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { formatLKRCompact, formatLKR } from '@/lib/format'
import ChartTooltip from './ChartTooltip'

const palette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9']

export default function TopCustomersChart({ data }) {
  if (data.length === 0) {
    return <div className="text-sm text-zinc-500 text-center py-10">No paid invoices yet.</div>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 56)}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
        <XAxis type="number" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={formatLKRCompact} hide />
        <YAxis type="category" dataKey="name" stroke="#71717a" tick={{ fill: '#e4e4e7', fontSize: 12 }} width={140} />
        <Tooltip content={<ChartTooltip valueFormatter={formatLKR} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="total" name="Revenue" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
