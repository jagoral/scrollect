import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  fallback: (state: { message: string; reset: () => void }) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({
        message: this.state.error.message || "An unexpected error occurred.",
        reset: this.reset,
      });
    }
    return this.props.children;
  }
}
