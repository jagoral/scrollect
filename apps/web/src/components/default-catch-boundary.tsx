import { Link, rootRouteId, useCanGoBack, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle, Clock, Home, RefreshCw, RotateCcw } from "lucide-react";

import { isRateLimitError, formatRetryAfter } from "@/lib/rate-limit-error";

import { Button } from "./ui/button";

function RateLimitedError({ error, reset }: { error: Error; reset: () => void }) {
  const retryAfter = isRateLimitError(error) ? formatRetryAfter(error.data.retryAfter) : null;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div
        aria-hidden="true"
        className="mb-6 flex size-20 items-center justify-center border border-amber-500/30 text-amber-500"
      >
        <Clock className="size-10" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Slow down a bit</h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">
        You've made too many requests in a short period.
        {retryAfter
          ? ` Please wait ${retryAfter} before trying again.`
          : " Please wait a moment before trying again."}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="default" onClick={() => reset()}>
          <RefreshCw data-icon="inline-start" />
          Try again
        </Button>
        <Button variant="outline" render={<Link to="/" />}>
          <Home data-icon="inline-start" />
          Go home
        </Button>
      </div>
    </div>
  );
}

function ServerError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div
        aria-hidden="true"
        className="mb-6 flex size-20 items-center justify-center border border-destructive/30 text-destructive"
      >
        <AlertTriangle className="size-10" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Something went wrong</h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">
        We hit an unexpected error. This is on us, not you. Try refreshing or come back in a moment.
      </p>
      {process.env.NODE_ENV === "development" && error.message && (
        <pre className="mt-4 max-w-lg overflow-x-auto rounded-lg bg-muted p-4 text-left text-sm text-muted-foreground">
          {error.message}
        </pre>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          variant="default"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
        {isRoot || !canGoBack ? (
          <Button variant="outline" render={<Link to="/" />}>
            <Home data-icon="inline-start" />
            Go home
          </Button>
        ) : (
          <Button variant="outline" onClick={() => router.history.back()}>
            Go back
          </Button>
        )}
      </div>
    </div>
  );
}

export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps) {
  if (isRateLimitError(error)) {
    return <RateLimitedError error={error} reset={reset} />;
  }

  return <ServerError error={error} reset={reset} />;
}
