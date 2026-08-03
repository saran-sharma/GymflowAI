import { Component } from 'react'

/**
 * Any render error inside a route shows a recovery card instead of a blank
 * screen. A blank page with no explanation is the worst thing to hit in front
 * of a client, so always give them something to press.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="glass p-8">
          <h1 className="text-xl font-bold tracking-tightest text-white">This screen didn't load</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Something went wrong rendering this page. Reloading usually clears it.
          </p>
          <p className="num mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left text-[11px] text-zinc-500">
            {String(this.state.error?.message || this.state.error).slice(0, 220)}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload the page
            </button>
            <button onClick={() => this.setState({ error: null })} className="btn btn-ghost">
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
