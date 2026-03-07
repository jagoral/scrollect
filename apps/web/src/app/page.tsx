"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { BookOpen, Brain, Rss, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
    <div className="group rounded-xl border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
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
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_50%)] opacity-[0.08]" />
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-8 w-8" />
            </div>
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                Learn smarter,{" "}
                <span className="bg-gradient-to-r from-primary to-chart-1 bg-clip-text text-transparent">
                  scroll better
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground md:text-xl">
                Transform your saved content into a scrollable feed of bite-sized learning cards —
                like social media, but built from your own knowledge.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" render={<Link href="/signin" />} className="px-8">
                Get Started
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/signin" />}>
                Sign In
              </Button>
            </div>
          </div>

          {/* Features */}
          <div className="mx-auto w-full max-w-4xl px-4 pb-24">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
