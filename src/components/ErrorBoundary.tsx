import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = error.message;
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed.error) {
        friendly = parsed.error.includes('Missing or insufficient permissions')
          ? 'Access denied by library security rules. Please verify you are signed in with an authorized account.'
          : parsed.error;
      }
    } catch {
      // Keep original message
    }
    return { hasError: true, message: friendly };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0D10] text-[#F1F3F5] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#12151B] border border-white/10 rounded-xl p-6 space-y-4">
            <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg accent-bg cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
