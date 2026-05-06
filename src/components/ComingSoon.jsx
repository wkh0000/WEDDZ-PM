import { Sparkles, ArrowRight } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

export default function ComingSoon({ title, phase, description }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <div
        className="glass rounded-2xl p-10 sm:p-14 text-center"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-5 shadow-glow">
          <Sparkles className="w-7 h-7 text-indigo-400" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">Coming in Phase {phase}</h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">{description}</p>
        <div className="mt-8 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-indigo-300/80 border border-indigo-500/30 rounded-full px-3 py-1.5 bg-indigo-500/[0.08]">
          <ArrowRight className="w-3 h-3" /> Wired up — content lands in this phase
        </div>
      </div>
    </div>
  )
}
