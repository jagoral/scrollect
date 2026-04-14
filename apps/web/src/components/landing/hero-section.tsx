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
          <div className="max-w-lg">
            <div className="mb-4 inline-flex items-center border border-border px-3 py-1 text-xs tracking-widest text-muted-foreground uppercase">
              AI-powered learning feed
            </div>
            <h1
              id="hero-heading"
              className="text-5xl font-bold tracking-[-0.03em] text-balance sm:text-6xl md:text-7xl"
            >
              Remember <span className="text-primary">everything</span> you read.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty md:text-xl">
              AI turns your saved content into a curated learning feed.
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-4 md:items-start">
            <Button
              size="lg"
              render={<Link to="/signin" />}
              className="border border-primary bg-primary px-8 text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
              onClick={() => posthog?.capture("landing_cta_clicked", { location: "hero" })}
            >
              Get Started
            </Button>
            <span className="text-sm text-muted-foreground">
              Free during beta. No credit card required.
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
