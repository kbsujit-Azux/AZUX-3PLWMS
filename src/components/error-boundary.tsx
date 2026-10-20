import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  /** "dark" for the RF gun (always-dark shell), "light" for the web console. */
  tone?: "dark" | "light";
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ errorInfo: info });
    this.props.onError?.(error, info);
  }

  handleReset = () => {
    this.state = { hasError: false, error: null, errorInfo: null };
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const dark = (this.props.tone ?? "dark") === "dark";

      return (
        <div
          className={`flex h-full min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center ${
            dark ? "bg-slate-950" : "bg-background"
          }`}
        >
          <AlertTriangle className={`h-12 w-12 ${dark ? "text-red-400" : "text-destructive"}`} />
          <h2 className={`text-lg font-semibold ${dark ? "text-white" : "text-foreground"}`}>
            Something went wrong
          </h2>
          <p className={`max-w-md text-xs ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className={`gap-2 ${
              dark
                ? "border-slate-700 text-slate-300 hover:text-white"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <RefreshCcw className="h-4 w-4" /> Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
