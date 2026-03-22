import { createFileRoute } from "@tanstack/react-router";

import LegalPageLayout from "@/components/legal-page-layout";
import content from "@/content/legal/terms-and-conditions.md?raw";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () => ({
    meta: [{ title: "Terms and Conditions - Scrollect" }],
    links: [{ rel: "canonical", href: "https://scrollect.app/terms-and-conditions" }],
  }),
  component: TermsAndConditionsPage,
});

function TermsAndConditionsPage() {
  return <LegalPageLayout content={content} />;
}
