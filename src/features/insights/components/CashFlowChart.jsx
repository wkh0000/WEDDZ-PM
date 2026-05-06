import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { formatLKRCompact, formatLKR } from '@/lib/format'
import ChartTooltip from './ChartTooltip'

export default function CashFlowChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-balance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
        <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={formatLKRCompact} />
        <Tooltip content={<ChartTooltip valueFormatter={formatLKR} />} />
        <Area type="monotone" dataKey="balance" name="Running balance" stroke="#818cf8" strokeWidth={2} fill="url(#grad-balance)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
