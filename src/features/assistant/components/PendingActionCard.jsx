import { motion } from 'framer-motion'
import { ShieldAlert, CheckCircle2, X } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function PendingActionCard({ action, onConfirm, onReject, busy }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100">
          <div className="font-medium">Confirm action</div>
          <div className="mt-0.5 text-amber-200/90">I'd like to <span className="font-semibold">{action.summary}</span>.</div>
          {action.args && Object.keys(action.args).length > 0 && (
            <div className="mt-2 text-[11px] font-mono text-amber-200/70 bg-black/20 rounded p-2 max-h-32 overflow-y-auto">
              {Object.entries(action.args).map(([k, v]) => (
                <div key={k}><span className="text-amber-300/80">{k}</span>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="xs" variant="ghost" leftIcon={<X className="w-3 h-3" />} onClick={onReject} disabled={busy}>Cancel</Button>
        <Button size="xs" variant="success" leftIcon={<CheckCircle2 className="w-3 h-3" />} onClick={onConfirm} loading={busy}>Confirm</Button>
      </div>
    </motion.div>
  )
}
