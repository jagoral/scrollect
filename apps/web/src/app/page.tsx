"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Brain, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ScrollectLogo } from "@/components/scrollect-logo";
import { Button } from "@/components/ui/button";

function AuthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/library");
  }, [router]);
  return null;
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10 transition-colors group-hover:from-primary/20 group-hover:to-primary/10">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Authenticated>
        <AuthenticatedRedirect />
      </Authenticated>
      <Unauthenticated>
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Hero */}
          <div className="relative flex flex-col items-center justify-center gap-8 px-4 py-24 text-center md:py-32">
            {/* Background grid pattern */}
            <div
              className="absolute inset-0 -z-10 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
                backgroundSize: "64px 64px",
                maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
              }}
            />
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_50%)] opacity-[0.08]" />

            {/* Staggered entrance */}
            <div className="animate-stagger-in flex flex-col items-center gap-8">
              <div className="text-primary">
                <ScrollectLogo size="xl" />
              </div>
              <div className="max-w-2xl">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                  Learn smarter,{" "}
                  <span className="bg-gradient-to-r from-primary via-chart-1 to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
                    scroll better
                  </span>
                </h1>
                <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground md:text-xl">
                  Transform your saved content into a scrollable feed of bite-sized learning cards —
                  like social media, but built from your own knowledge.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  render={<Link href="/signin" />}
                  className="px-8 shadow-primary/20 transition-all hover:shadow-[0_0_20px_-5px_var(--color-primary)] active:scale-[0.97]"
                >
                  Get Started
                </Button>
                <Button size="lg" variant="outline" render={<Link href="/signin" />}>
                  Sign In
                </Button>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mx-auto w-full max-w-4xl px-4 pb-24">
            <div className="animate-stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Upload}
                title="Low friction input"
                description="Drop PDFs or Markdown files — adding content takes seconds, not minutes."
              />
              <FeatureCard
                icon={Sparkles}
                title="AI-powered feed"
                description="A dedicated AI agent transforms your documents into engaging learning cards."
              />
              <FeatureCard
                icon={Brain}
                title="Retain what you read"
                description="Bite-sized cards help you actually remember and connect what you learn."
              />
            </div>
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </AuthLoading>
    </>
  );
}
