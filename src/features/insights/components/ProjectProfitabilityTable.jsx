import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import { formatLKR } from '@/lib/format'
import { Link } from 'react-router-dom'
import { projectStatusBadge } from '@/features/projects/components/ProjectStatusBadge'

export default function ProjectProfitabilityTable({ rows }) {
  if (!rows.length) {
    return <div className="text-sm text-zinc-500 text-center py-10">No projects yet.</div>
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Project</TH><TH>Customer</TH><TH>Status</TH>
          <TH align="right">Revenue</TH><TH align="right">Expenses</TH><TH align="right">Net</TH>
        </TR>
      </THead>
      <tbody>
        {rows.map(r => (
          <TR key={r.id} hover>
            <TD>
              <Link to={`/projects/${r.slug}`} className="font-medium text-zinc-100 hover:text-indigo-300">{r.name}</Link>
            </TD>
            <TD className="text-zinc-300">{r.customerName}</TD>
            <TD>{projectStatusBadge(r.status)}</TD>
            <TD align="right" className="text-emerald-300">{formatLKR(r.revenue)}</TD>
            <TD align="right" className="text-rose-300">{formatLKR(r.expenses)}</TD>
            <TD align="right" className={r.net >= 0 ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'}>
              {formatLKR(r.net)}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  )
}
