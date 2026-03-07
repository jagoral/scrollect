"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { BookOpen, Menu, Rss, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "./ui/button";
import { ModeToggle } from "./mode-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import UserMenu from "./user-menu";

const navLinks = [
  { to: "/feed", label: "Feed", icon: Rss },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/upload", label: "Upload", icon: Upload },
] as const;

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="z-50 border-b bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-row items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </div>
            Scrollect
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Button
                key={to}
                variant={pathname === to ? "secondary" : "ghost"}
                size="sm"
                render={<Link href={to} />}
                className={pathname === to ? "font-medium" : "text-muted-foreground"}
              >
                <Icon className="mr-1.5 h-4 w-4" />
                {label}
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
              <div className="h-9 w-16 animate-pulse rounded-md bg-muted" />
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
                <SheetTitle className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                  </div>
                  Scrollect
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
