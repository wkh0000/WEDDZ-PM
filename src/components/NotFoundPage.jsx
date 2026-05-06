import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-app-radial flex items-center justify-center p-6">
      <div
        className="glass rounded-3xl p-12 max-w-md w-full text-center shadow-glow"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-5">
          <Compass className="w-7 h-7 text-indigo-400" />
        </div>
        <div className="text-6xl font-bold text-zinc-100 mb-2 tracking-tight">404</div>
        <p className="text-zinc-400 mb-8">This page doesn't exist or has been moved.</p>
        <Link to="/">
          <Button variant="primary" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}
