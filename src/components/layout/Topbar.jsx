import { useNavigate } from 'react-router-dom'
import { LogOut, Settings, Menu } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import DropdownMenu from '@/components/ui/DropdownMenu'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

export default function Topbar({ onMenuClick }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  async function handleSignOut() {
    try {
      await signOut()
      toast.success('Signed out')
      navigate('/login', { replace: true })
    } catch (e) {
      toast.error(e.message ?? 'Failed to sign out')
    }
  }

  return (
    <header className="h-16 shrink-0 border-b border-white/10 bg-zinc-950/60 backdrop-blur-md flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-zinc-400 hover:text-zinc-200 p-1.5 rounded-md hover:bg-white/5 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        {profile?.role === 'super_admin' && (
          <Badge tone="indigo" size="sm">Super Admin</Badge>
        )}
        <DropdownMenu
          trigger={
            <button className="flex items-center gap-2.5 pl-2 pr-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors">
              <Avatar name={profile?.full_name || profile?.email} src={profile?.avatar_url} size="sm" />
              <div className="text-left leading-tight hidden sm:block">
                <div className="text-sm font-medium text-zinc-100">{profile?.full_name || 'Member'}</div>
                <div className="text-xs text-zinc-500 truncate max-w-[180px]">{profile?.email}</div>
              </div>
            </button>
          }
          items={[
            { label: 'Account settings', icon: Settings, onClick: () => navigate('/account') },
            { separator: true },
            { label: 'Sign out', icon: LogOut, onClick: handleSignOut, danger: true }
          ]}
        />
      </div>
    </header>
  )
}
