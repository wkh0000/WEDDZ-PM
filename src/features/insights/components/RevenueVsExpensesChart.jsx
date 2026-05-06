import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { formatLKRCompact, formatLKR } from '@/lib/format'
import ChartTooltip from './ChartTooltip'

export default function RevenueVsExpensesChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
        <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={formatLKRCompact} />
        <Tooltip content={<ChartTooltip valueFormatter={formatLKR} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend wrapperStyle={{ paddingTop: 8 }} formatter={(v) => <span className="text-zinc-300 text-xs">{v}</span>} />
        <Bar dataKey="revenue" name="Revenue"  fill="url(#grad-rev)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="url(#grad-exp)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
