import { createFileRoute } from "@tanstack/react-router";

import LegalPageLayout from "@/components/legal-page-layout";
import content from "@/content/legal/privacy-policy.md?raw";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [{ title: "Privacy Policy - Scrollect" }],
    links: [{ rel: "canonical", href: "https://scrollect.app/privacy-policy" }],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return <LegalPageLayout content={content} />;
}
