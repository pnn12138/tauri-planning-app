import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Fatal render error:", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message ?? String(this.state.error);
    const stack = this.state.error?.stack ?? "";
    return (
      <div className="fatal-error">
        <div className="fatal-error-title">App crashed</div>
        <div className="fatal-error-message">{message}</div>
        {stack && <pre className="fatal-error-stack">{stack}</pre>}
        <div className="fatal-error-hint">
          Open DevTools to see full logs.
        </div>
      </div>
    );
  }
}

