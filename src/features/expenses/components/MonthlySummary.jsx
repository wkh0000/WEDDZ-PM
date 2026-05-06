import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import { motion } from 'framer-motion'
import { monthlySummary, EXPENSE_CATEGORIES } from '../api'
import { formatLKR, formatMonth } from '@/lib/format'

const tones = {
  Software:      'bg-indigo-500',
  Hardware:      'bg-violet-500',
  Travel:        'bg-sky-500',
  Subcontractor: 'bg-emerald-500',
  Marketing:     'bg-amber-500',
  Salary:        'bg-rose-500',
  Other:         'bg-zinc-400'
}

export default function MonthlySummary({ year, month }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    monthlySummary(year, month)
      .then(d => { if (mounted) setData(d) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [year, month])

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Wallet className="w-4 h-4 text-indigo-400" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500">Monthly summary</div>
            <div className="text-sm font-medium text-zinc-200">{formatMonth(year, month)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-zinc-100">
            {loading ? <span className="inline-block w-24 h-7 bg-white/5 rounded animate-pulse" /> : formatLKR(data?.total ?? 0)}
          </div>
          <div className="text-xs text-zinc-500">{loading ? '' : `${data?.count ?? 0} entries`}</div>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex justify-center"><Spinner size="sm" /></div>
      ) : (
        <CategoryBreakdown total={data.total} byCategory={data.byCategory} />
      )}
    </Card>
  )
}

function CategoryBreakdown({ total, byCategory }) {
  const max = Math.max(1, ...Object.values(byCategory))
  const sorted = EXPENSE_CATEGORIES
    .map(c => ({ category: c, amount: byCategory[c] ?? 0 }))
    .sort((a, b) => b.amount - a.amount)

  return (
    <div className="mt-5 space-y-2.5">
      {sorted.map((row, i) => (
        <motion.div
          key={row.category}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03, duration: 0.18 }}
          className="space-y-1"
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${tones[row.category] || 'bg-zinc-400'}`} />
              <span className="text-zinc-400">{row.category}</span>
            </div>
            <span className="text-zinc-200 font-medium tabular-nums">{formatLKR(row.amount)}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${tones[row.category] || 'bg-zinc-400'}`}
              initial={{ width: 0 }}
              animate={{ width: `${(row.amount / max) * 100}%` }}
              transition={{ delay: 0.1 + i * 0.04, duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  )
}
