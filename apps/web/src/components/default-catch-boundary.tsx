import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "./ui/button";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <ErrorComponent error={error} />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.invalidate()}>
          Try again
        </Button>
        {isRoot ? (
          <Button variant="default" render={<Link to="/" />}>
            Go home
          </Button>
        ) : (
          <Button variant="default" onClick={() => window.history.back()}>
            Go back
          </Button>
        )}
      </div>
    </div>
  );
}
