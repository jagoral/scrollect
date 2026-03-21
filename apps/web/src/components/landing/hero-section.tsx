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
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-primary)_0%,transparent_50%)] opacity-[0.08]" />
      <div
        className="absolute inset-0 -z-10 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center top, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center top, black 30%, transparent 70%)",
        }}
      />

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 pt-12 md:flex-row md:items-center md:gap-16 md:pt-0">
        <div className="animate-hero-in flex flex-1 flex-col items-center text-center md:items-start md:text-left">
          <div className="max-w-lg">
            <h1
              id="hero-heading"
              className="text-5xl font-bold tracking-tight text-balance sm:text-6xl md:text-7xl"
            >
              <span className="bg-gradient-to-r from-primary via-chart-1 to-primary bg-clip-text text-transparent">
                Remember everything
              </span>{" "}
              you read.
            </h1>
            <p className="mt-4 text-lg text-foreground/70 text-pretty md:text-xl">
              AI turns your saved content into a curated learning feed.
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-3 md:items-start">
            <Button
              size="lg"
              render={<Link to="/signin" />}
              className="px-8 shadow-[0_0_20px_-5px_var(--color-primary)] transition-shadow hover:shadow-[0_0_30px_-5px_var(--color-primary)] active:scale-[0.97]"
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

        {/* Phone mockup - visible on all breakpoints */}
        <div className="flex flex-1 -mx-2 justify-center md:mx-0">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
