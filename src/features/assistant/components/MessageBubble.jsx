import { motion } from 'framer-motion'
import { Sparkles, ListChecks } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

export default function MessageBubble({ msg, profile }) {
  const isUser = msg.role === 'user'
  const isError = msg.role === 'error'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn('flex items-start gap-2.5', isUser && 'flex-row-reverse')}
    >
      <div className="shrink-0">
        {isUser ? (
          <Avatar name={profile?.full_name || profile?.email} src={profile?.avatar_url} size="xs" />
        ) : (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/30">
            <Sparkles className="w-3 h-3 text-indigo-300" />
          </span>
        )}
      </div>
      <div className={cn('flex-1 min-w-0 space-y-1.5', isUser && 'text-right')}>
        <div className={cn(
          'inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
          isUser
            ? 'bg-indigo-500/15 text-indigo-100 border border-indigo-500/25'
            : isError
              ? 'bg-rose-500/10 text-rose-200 border border-rose-500/30'
              : 'bg-white/[0.05] text-zinc-100 border border-white/10'
        )}>
          {msg.content}
        </div>
        {msg.actions?.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', isUser && 'justify-end')}>
            {msg.actions.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400 bg-white/[0.03] border border-white/10 rounded-full px-2 py-0.5"
                title={a.tool}
              >
                <ListChecks className="w-2.5 h-2.5" />
                {a.summary}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
