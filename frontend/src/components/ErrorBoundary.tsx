import { Component, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error)
    // Log to Slack on critical errors
    fetch('/api/error-log', {
      method: 'POST',
      body: JSON.stringify({ error: error.message, stack: error.stack, timestamp: new Date().toISOString() })
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-nova-navydark p-6">
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle size={48} className="text-nova-crimson mx-auto" />
            <h1 className="text-xl font-display text-white">Something went wrong</h1>
            <p className="text-sm text-nova-muted">{this.state.error?.message || 'An unexpected error occurred'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-nova-gold text-nova-navy text-sm font-body hover:brightness-110 transition-all">
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
