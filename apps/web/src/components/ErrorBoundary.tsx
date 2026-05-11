import React from "react";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

// Last-line-of-defence boundary. React would otherwise blank the page on any
// uncaught render error; we surface a friendly message and a recovery action
// (reload). Production deployments can wire `componentDidCatch` to Sentry.
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (typeof window !== "undefined") {
      // Keep a breadcrumb in the console so a dev hitting F12 can see the trace.
      // eslint-disable-next-line no-console
      console.error("app_render_error", error, info.componentStack);
    }
  }

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bone px-6 text-center text-brand-ink dark:bg-brand-ink dark:text-brand-bone"
      >
        <h1 className="font-display text-2xl">Algo deu errado por aqui.</h1>
        <p className="max-w-md text-sm text-brand-navy/80 dark:text-brand-bone/80">
          Recarregue a página em alguns instantes. Se o problema persistir, fale com a gente pelo WhatsApp.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-full bg-brand-gold px-5 py-2 font-semibold text-brand-ink shadow-soft transition hover:brightness-105"
        >
          Recarregar
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
