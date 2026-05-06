import { Component } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[error-boundary]', error, info)
  }
  reset = () => { this.setState({ error: null }) }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen bg-zinc-950 bg-app-radial flex items-center justify-center p-6">
        <div className="glass rounded-3xl p-10 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 mb-5">
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-2">Something went wrong</h1>
          <p className="text-sm text-zinc-400 mb-6">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={this.reset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium"
            >
              <RefreshCcw className="w-4 h-4" /> Try again
            </button>
            <Link to="/" onClick={this.reset} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/10 text-zinc-200 text-sm font-medium border border-white/10">
              <Home className="w-4 h-4" /> Home
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
