import { createFileRoute, redirect } from "@tanstack/react-router";

import { BottomCtaSection } from "@/components/landing/bottom-cta-section";
import { CardTypesSection } from "@/components/landing/card-types-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (context.initialToken) {
      throw redirect({ to: "/app/library" });
    }
  },
  head: () => ({
    meta: [
      { title: "Scrollect - Remember Everything You Read" },
      {
        name: "description",
        content:
          "AI turns your saved content into a curated learning feed. Upload PDFs, articles, and markdown - get bite-sized learning cards you'll actually remember.",
      },
    ],
    links: [{ rel: "canonical", href: "https://scrollect.app/" }],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <HeroSection />
      <CardTypesSection />
      <HowItWorksSection />
      <BottomCtaSection />
    </div>
  );
}
