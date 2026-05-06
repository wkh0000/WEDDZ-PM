import { useEffect, useState, useMemo } from 'react'
import { Plus, Search, MoreHorizontal, UserPlus, Pencil, Shield, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listProfiles } from '../api'
import AddTeamMemberModal from '../components/AddTeamMemberModal'
import EditTeamMemberModal from '../components/EditTeamMemberModal'

export default function UsersListPage() {
  const { user: currentUser } = useAuth()
  const toast = useToast()
  const addDisc = useDisclosure()
  const editDisc = useDisclosure()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { document.title = 'Team Members · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await listProfiles()
      setProfiles(data)
    } catch (err) {
      toast.error(err.message || 'Failed to load team')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(p =>
      p.email?.toLowerCase().includes(q) ||
      p.full_name?.toLowerCase().includes(q) ||
      p.role?.toLowerCase().includes(q)
    )
  }, [profiles, debouncedSearch])

  function openEdit(member) { setEditing(member); editDisc.onOpen() }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Members"
        description="Manage who can sign in to WEDDZ PM and what they can do."
        actions={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={addDisc.onOpen}>
            Add member
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input
            leftIcon={<Search className="w-4 h-4" />}
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto text-xs text-zinc-500">
          {filtered.length} {filtered.length === 1 ? 'member' : 'members'}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex items-center justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'No matches' : 'No team members yet'}
          description={search ? 'Try a different query.' : 'Add the first team member to get started.'}
          action={!search && (
            <Button leftIcon={<UserPlus className="w-4 h-4" />} onClick={addDisc.onOpen}>Add member</Button>
          )}
        />
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map(p => (
                <TR key={p.id} hover>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name || p.email} src={p.avatar_url} size="sm" />
                      <div>
                        <div className="font-medium text-zinc-100">
                          {p.full_name || '—'}
                          {p.id === currentUser?.id && <span className="ml-2 text-xs text-zinc-500">(you)</span>}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-zinc-400">{p.email}</TD>
                  <TD>
                    {p.role === 'super_admin' ? (
                      <Badge tone="indigo" dot>Super Admin</Badge>
                    ) : (
                      <Badge dot>Member</Badge>
                    )}
                  </TD>
                  <TD>
                    {p.active ? (
                      <Badge tone="emerald" dot>Active</Badge>
                    ) : (
                      <Badge tone="rose" dot>Inactive</Badge>
                    )}
                  </TD>
                  <TD className="text-zinc-400">{formatDate(p.created_at)}</TD>
                  <TD align="right">
                    <DropdownMenu
                      trigger={
                        <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                      items={[
                        { label: 'Edit member', icon: Pencil, onClick: () => openEdit(p) },
                        { label: p.role === 'super_admin' ? 'Active super admin' : 'Active member', icon: Shield, disabled: true }
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </motion.div>
      )}

      <AddTeamMemberModal open={addDisc.open} onClose={addDisc.onClose} onCreated={load} />
      <EditTeamMemberModal open={editDisc.open} onClose={editDisc.onClose} member={editing} onUpdated={load} />
    </div>
  )
}
