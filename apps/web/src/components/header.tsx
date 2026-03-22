import { Link } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Bookmark, BookOpen, Menu, Rss, Upload } from "lucide-react";
import { useState } from "react";

import { ScrollectBrand } from "./scrollect-logo";
import { Button } from "./ui/button";
import { ModeToggle } from "./mode-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import UserMenu from "./user-menu";

const navLinks = [
  { to: "/feed" as const, label: "Feed", icon: Rss },
  { to: "/saved" as const, label: "Saved", icon: Bookmark },
  { to: "/library" as const, label: "Library", icon: BookOpen },
  { to: "/upload" as const, label: "Upload", icon: Upload },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="z-50 border-b border-border/50 bg-background/80 shadow-[0_1px_3px_0_rgb(0_0_0/0.02)] backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-5xl flex-row items-center justify-between px-4 py-3 md:px-0">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-foreground flex items-center">
            <ScrollectBrand iconSize="md" />
          </Link>
          <Authenticated>
            <nav className="hidden items-center gap-1 md:flex">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <Button
                  key={to}
                  variant="ghost"
                  size="sm"
                  render={
                    <Link
                      to={to}
                      activeOptions={{ includeSearch: false }}
                      activeProps={{
                        className:
                          "bg-secondary text-secondary-foreground relative font-medium after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-primary",
                      }}
                    />
                  }
                  className="text-muted-foreground"
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  {label}
                </Button>
              ))}
            </nav>
          </Authenticated>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <Authenticated>
            <div className="hidden md:block">
              <UserMenu />
            </div>
          </Authenticated>
          <Unauthenticated>
            <Button variant="default" size="sm" render={<Link to="/signin" />}>
              Sign In
            </Button>
          </Unauthenticated>
          <AuthLoading>
            <div className="hidden md:block">
              <div className="h-9 w-16 animate-pulse rounded-md bg-muted" />
            </div>
          </AuthLoading>

          <Authenticated>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle className="text-foreground">
                    <ScrollectBrand iconSize="sm" />
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1 px-4">
                  {navLinks.map(({ to, label, icon: Icon }) => (
                    <Button
                      key={to}
                      variant="ghost"
                      className="justify-start"
                      render={
                        <Link
                          to={to}
                          activeOptions={{ includeSearch: false }}
                          activeProps={{
                            className: "bg-secondary text-secondary-foreground",
                          }}
                        />
                      }
                      onClick={() => setOpen(false)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </nav>
                <div className="mt-6 px-4">
                  <UserMenu />
                </div>
              </SheetContent>
            </Sheet>
          </Authenticated>
        </div>
      </div>
    </header>
  );
}
