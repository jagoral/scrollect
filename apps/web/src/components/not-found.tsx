import { Link } from "@tanstack/react-router";

import { Button } from "./ui/button";

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">
        {children ?? "The page you're looking for doesn't exist."}
      </p>
      <Button variant="default" render={<Link to="/" />}>
        Go home
      </Button>
    </div>
  );
}
