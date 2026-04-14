import { Link } from "@tanstack/react-router";
import { BookOpen, Home, Rss, Search } from "lucide-react";

import { Button } from "./ui/button";

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div
        aria-hidden="true"
        className="relative mb-6 flex size-20 items-center justify-center border border-primary/30 text-primary"
      >
        <Search className="size-10" />
        <span className="absolute -right-1 -top-1 flex size-7 items-center justify-center border border-border bg-card text-xs font-bold text-muted-foreground">
          ?
        </span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Page not found</h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">
        {children ?? "The page you're looking for doesn't exist or may have been moved."}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="default" render={<Link to="/" />}>
          <Home data-icon="inline-start" />
          Go home
        </Button>
        <Button variant="outline" render={<Link to="/app/feed" />}>
          <Rss data-icon="inline-start" />
          Browse feed
        </Button>
        <Button variant="outline" render={<Link to="/app/library" />}>
          <BookOpen data-icon="inline-start" />
          View library
        </Button>
      </div>
    </div>
  );
}
