"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Bookmark, BookOpen, Menu, Rss, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ScrollectLogo } from "./scrollect-logo";
import { Button } from "./ui/button";
import { ModeToggle } from "./mode-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import UserMenu from "./user-menu";

const navLinks = [
  { to: "/feed", label: "Feed", icon: Rss },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/upload", label: "Upload", icon: Upload },
] as const;

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="z-50 border-border/50 border-b bg-background/80 shadow-[0_1px_3px_0_rgb(0_0_0/0.02)] backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-row items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-primary">
            <span className="hidden md:inline">
              <ScrollectLogo size="md" showText />
            </span>
            <span className="md:hidden">
              <ScrollectLogo size="sm" showText />
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Button
                key={to}
                variant={pathname === to ? "secondary" : "ghost"}
                size="sm"
                render={<Link href={to} />}
                className={`relative ${pathname === to ? "font-medium" : "text-muted-foreground"}`}
              >
                <Icon className="mr-1.5 h-4 w-4" />
                {label}
                {pathname === to && (
                  <span className="absolute -bottom-3 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </Button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <div className="hidden md:block">
            <Authenticated>
              <UserMenu />
            </Authenticated>
            <Unauthenticated>
              <Button variant="default" size="sm" render={<Link href="/signin" />}>
                Sign In
              </Button>
            </Unauthenticated>
            <AuthLoading>
              <div className="h-9 w-16 skeleton-shimmer rounded-md" />
            </AuthLoading>
          </div>

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>
                  <ScrollectLogo size="sm" showText className="text-primary" />
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1 px-4">
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <Button
                    key={to}
                    variant={pathname === to ? "secondary" : "ghost"}
                    className="justify-start"
                    render={<Link href={to} />}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </nav>
              <div className="mt-6 px-4">
                <Authenticated>
                  <UserMenu />
                </Authenticated>
                <Unauthenticated>
                  <Button
                    variant="default"
                    className="w-full"
                    render={<Link href="/signin" />}
                    onClick={() => setOpen(false)}
                  >
                    Sign In
                  </Button>
                </Unauthenticated>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
