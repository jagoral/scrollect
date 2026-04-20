import { Link } from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";

import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/use-landing-section";

import { PhoneMockup } from "./phone-mockup";

export function HeroSection() {
  const posthog = usePostHog();
  const { ref } = useLandingSection("hero", { initiallyVisible: true });

  return (
    <section
      ref={ref}
      aria-labelledby="hero-heading"
      className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col justify-center px-4"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 pt-12 md:flex-row md:items-center md:gap-16 md:pt-0">
        <div className="animate-hero-in flex flex-1 flex-col items-center text-center md:items-start md:text-left">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2.5 text-muted-foreground">
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em]">
                AI Learning Feed
              </span>
            </div>
            <h1
              id="hero-heading"
              className="font-logo text-[3.25rem] font-semibold leading-[1] tracking-[-0.02em] text-balance sm:text-6xl md:text-[5.25rem]"
            >
              Remember <em className="not-italic text-primary">everything</em> you read.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-pretty md:text-xl md:leading-[1.55]">
              AI turns your saved content into a curated learning feed - bite-sized posts
              you&apos;ll actually remember.
            </p>
          </div>
          <div className="mt-10 flex flex-col items-center gap-4 md:items-start">
            <Button
              size="lg"
              render={<Link to="/signin" />}
              className="border border-primary bg-primary px-8 text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
              onClick={() => posthog?.capture("landing_cta_clicked", { location: "hero" })}
            >
              Get Started
            </Button>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
              Free during beta · No credit card
            </span>
            <span className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/signin"
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                Sign in
              </Link>
            </span>
          </div>
        </div>

        <div className="flex flex-1 justify-center md:mx-0">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
