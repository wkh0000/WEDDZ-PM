import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, BarChart3, LineChart as LineIcon, Wallet, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/context/ToastContext'
import { formatLKRCompact } from '@/lib/format'
import { monthlyRevenueExpenses, projectProfitability, topCustomers, cashFlow } from '../api'
import RevenueVsExpensesChart from '../components/RevenueVsExpensesChart'
import CashFlowChart from '../components/CashFlowChart'
import TopCustomersChart from '../components/TopCustomersChart'
import ProjectProfitabilityTable from '../components/ProjectProfitabilityTable'

export default function InsightsPage() {
  const toast = useToast()
  const [series, setSeries] = useState([])
  const [profitability, setProfitability] = useState([])
  const [customers, setCustomers] = useState([])
  const [flow, setFlow] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'Insights · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [rev, prof, cust, cf] = await Promise.all([
        monthlyRevenueExpenses(12),
        projectProfitability(),
        topCustomers(5),
        cashFlow(12)
      ])
      setSeries(rev); setProfitability(prof); setCustomers(cust); setFlow(cf)
    } catch (err) {
      toast.error(err.message || 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }

  const totalRevenue  = series.reduce((s, r) => s + r.revenue, 0)
  const totalExpenses = series.reduce((s, r) => s + r.expenses, 0)
  const net = totalRevenue - totalExpenses
  const lastMonthRev  = series.at(-1)?.revenue ?? 0
  const prevMonthRev  = series.at(-2)?.revenue ?? 0
  const trend = prevMonthRev === 0 ? 0 : ((lastMonthRev - prevMonthRev) / prevMonthRev) * 100

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Revenue, profitability, and cash flow over the last 12 months."
      />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          <motion.div
            initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-4"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <StatCard icon={Wallet} tone="emerald" label="Revenue (12mo)" value={formatLKRCompact(totalRevenue)} />
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <StatCard icon={Wallet} tone="rose"    label="Expenses (12mo)" value={formatLKRCompact(totalExpenses)} />
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <StatCard
                icon={net >= 0 ? TrendingUp : TrendingDown}
                tone={net >= 0 ? 'indigo' : 'rose'}
                label="Net"
                value={formatLKRCompact(net)}
              />
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <StatCard
                icon={trend >= 0 ? TrendingUp : TrendingDown}
                tone={trend >= 0 ? 'emerald' : 'amber'}
                label="MoM Revenue Trend"
                value={`${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`}
                hint={prevMonthRev === 0 ? 'No prior data' : 'Vs last month'}
              />
            </motion.div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <ChartHeader icon={BarChart3} title="Revenue vs Expenses" subtitle="Last 12 months" />
              <RevenueVsExpensesChart data={series} />
            </Card>
            <Card>
              <ChartHeader icon={Users} title="Top customers" subtitle="By total revenue" />
              <TopCustomersChart data={customers} />
            </Card>
          </div>

          <Card>
            <ChartHeader icon={LineIcon} title="Cash flow" subtitle="Running net balance" />
            <CashFlowChart data={flow} />
          </Card>

          <Card padded={false}>
            <div className="px-5 py-3.5 border-b border-white/10">
              <ChartHeader icon={BarChart3} title="Project profitability" subtitle="Revenue minus expenses per project" inline />
            </div>
            <ProjectProfitabilityTable rows={profitability} />
          </Card>
        </>
      )}
    </div>
  )
}

function ChartHeader({ icon: Icon, title, subtitle, inline }) {
  return (
    <div className={`flex items-center gap-3 ${inline ? '' : 'mb-4'}`}>
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
        <Icon className="w-4 h-4" />
      </span>
      <div>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <div className="text-xs text-zinc-500">{subtitle}</div>
      </div>
    </div>
  )
}
