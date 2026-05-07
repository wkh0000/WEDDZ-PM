import { useState } from 'react'
import { Download, Mail, Database, Clock, ShieldCheck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { triggerBackup } from '../api'

export default function BackupsPage() {
  const toast = useToast()
  const { profile } = useAuth()
  const [recipient, setRecipient] = useState(profile?.email ?? '')
  const [busyEmail, setBusyEmail] = useState(false)
  const [busyDownload, setBusyDownload] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  async function onEmail() {
    setBusyEmail(true)
    try {
      const data = await triggerBackup({ mode: 'email', emailTo: recipient || undefined })
      setLastResult(data)
      toast.success(`Backup emailed to ${data.sent_to}`)
    } catch (e) {
      toast.error(e.message || 'Backup failed')
    } finally {
      setBusyEmail(false)
    }
  }

  async function onDownload() {
    setBusyDownload(true)
    try {
      const data = await triggerBackup({ mode: 'download' })
      setLastResult(data)
      const text = atob(data.content_base64)
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = data.filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Downloaded')
    } catch (e) {
      toast.error(e.message || 'Backup failed')
    } finally {
      setBusyDownload(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backups"
        description="Capture a JSON snapshot of every business table. Daily backup runs automatically; trigger ad-hoc here."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Clock className="w-4 h-4 text-indigo-400" />
            </span>
            <div className="text-xs uppercase tracking-widest text-zinc-500">Schedule</div>
          </div>
          <div className="text-sm font-semibold text-zinc-100">Daily 03:00 Asia/Colombo</div>
          <div className="text-xs text-zinc-500 mt-1">21:30 UTC. Driven by pg_cron + pg_net.</div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </span>
            <div className="text-xs uppercase tracking-widest text-zinc-500">Tables captured</div>
          </div>
          <div className="text-sm font-semibold text-zinc-100">18</div>
          <div className="text-xs text-zinc-500 mt-1">profiles, customers, projects, invoices, expenses, kanban &amp; more.</div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Mail className="w-4 h-4 text-amber-400" />
            </span>
            <div className="text-xs uppercase tracking-widest text-zinc-500">Default recipient</div>
          </div>
          <div className="text-sm font-semibold text-zinc-100 truncate">wkh0000@gmail.com</div>
          <div className="text-xs text-zinc-500 mt-1">Override below for one-off sends.</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shrink-0">
            <Database className="w-5 h-5 text-indigo-400" />
          </span>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-zinc-100">Trigger a backup now</h3>
            <p className="text-sm text-zinc-400">Email the snapshot to the address below, or download it as a JSON file.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              <div className="space-y-2">
                <Input
                  label="Email to"
                  type="email"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="wkh0000@gmail.com"
                  hint="Leave default to use BACKUP_RECIPIENT secret."
                />
                <Button onClick={onEmail} loading={busyEmail} leftIcon={<Mail className="w-4 h-4" />} className="w-full">
                  Email backup now
                </Button>
              </div>
              <div className="space-y-2 sm:pt-7">
                <Button onClick={onDownload} loading={busyDownload} variant="subtle" leftIcon={<Download className="w-4 h-4" />} className="w-full">
                  Download JSON
                </Button>
                <p className="text-xs text-zinc-500">Browser downloads the snapshot directly. Nothing emailed.</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {lastResult && (
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Last backup</h3>
            <span className="text-xs text-zinc-500">
              {lastResult.filename} · {(lastResult.snapshot_size_bytes / 1024).toFixed(1)} KB
              {lastResult.email_id && <> · email <span className="font-mono">{lastResult.email_id.slice(0, 8)}…</span></>}
            </span>
          </div>
          <Table className="border-0">
            <THead>
              <TR><TH>Table</TH><TH align="right">Rows</TH></TR>
            </THead>
            <tbody>
              {Object.entries(lastResult.counts ?? {}).map(([t, n]) => (
                <TR key={t}>
                  <TD className="font-mono text-xs">{t}</TD>
                  <TD align="right" className="tabular-nums">{n}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
