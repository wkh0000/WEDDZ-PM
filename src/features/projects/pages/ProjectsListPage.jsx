import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, FolderKanban, Calendar, Wallet } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate } from '@/lib/format'
import { listProjects } from '../api'
import ProjectFormModal from '../components/ProjectFormModal'
import { projectStatusBadge, PROJECT_STATUSES } from '../components/ProjectStatusBadge'
import { cn } from '@/lib/cn'

export default function ProjectsListPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const formDisc = useDisclosure()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { document.title = 'Projects · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try { setItems(await listProjects()) }
    catch (err) { toast.error(err.message || 'Failed to load projects') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    let arr = items
    if (statusFilter !== 'all') arr = arr.filter(p => p.status === statusFilter)
    const q = debouncedSearch.trim().toLowerCase()
    if (q) arr = arr.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.customer?.name?.toLowerCase().includes(q) ||
      p.customer?.company?.toLowerCase().includes(q)
    )
    return arr
  }, [items, statusFilter, debouncedSearch])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Track active engagements and their financials."
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={formDisc.onOpen}>New project</Button>}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input leftIcon={<Search className="w-4 h-4" />} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
          {PROJECT_STATUSES.map(s => (
            <FilterChip key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex items-center justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={search || statusFilter !== 'all' ? 'No matches' : 'No projects yet'}
          description={search || statusFilter !== 'all' ? 'Try changing the filter.' : 'Create your first project.'}
          action={!search && statusFilter === 'all' && <Button leftIcon={<Plus className="w-4 h-4" />} onClick={formDisc.onOpen}>New project</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.id}>
              <Card hover className="cursor-pointer h-full" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-base font-semibold text-zinc-100 leading-snug">{p.name}</h3>
                  {projectStatusBadge(p.status)}
                </div>
                <div className="text-sm text-zinc-400 mb-4">
                  {p.customer ? (
                    <span>{p.customer.company || p.customer.name}</span>
                  ) : (
                    <span className="text-zinc-500 italic">Internal</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(p.start_date)}
                    {p.end_date && <> → {formatDate(p.end_date)}</>}
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-300 font-medium tabular-nums">
                    <Wallet className="w-3.5 h-3.5 text-zinc-500" />
                    {formatLKR(p.budget)}
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      <ProjectFormModal open={formDisc.open} onClose={formDisc.onClose} onSaved={load} />
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-full text-xs font-medium border transition-colors',
        active
          ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30'
          : 'bg-white/[0.04] text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
      )}
    >
      {children}
    </button>
  )
}
