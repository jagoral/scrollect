import { Link } from "@tanstack/react-router";
import { Unauthenticated } from "convex/react";

import { ScrollectBrand } from "./scrollect-logo";
import { Button } from "./ui/button";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 md:px-0">
        <Link to="/" className="text-foreground flex items-center">
          <ScrollectBrand iconSize="md" />
        </Link>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Unauthenticated>
            <Button variant="default" size="sm" render={<Link to="/signin" />}>
              Sign In
            </Button>
          </Unauthenticated>
        </div>
      </div>
    </header>
  );
}
