import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Dumb Diagrams UI crashed", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-recovery" role="alert">
        <div className="crash-recovery-card">
          <p className="crash-recovery-eyebrow">Studio recovery</p>
          <h1>The editor hit an unexpected error</h1>
          <p>
            Reload Studio to try restoring your last locally saved workspace and continue.
          </p>
          <details>
            <summary>Technical details</summary>
            <pre>{this.state.error.message || this.state.error.name}</pre>
          </details>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Studio
          </button>
        </div>
      </main>
    );
  }
}
