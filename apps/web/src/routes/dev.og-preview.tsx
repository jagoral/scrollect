import "@fontsource/geist-sans/latin-800.css";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { OgImage } from "@/components/og-images";

export const Route = createFileRoute("/dev/og-preview")({
  beforeLoad: () => {
    if (import.meta.env.PROD) {
      throw redirect({ to: "/" });
    }
  },
  component: OgPreviewPage,
});

function OgPreviewPage() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-[#0a0a0a] p-10">
      <h1 className="text-2xl text-white">OG Image Preview</h1>

      <div className="overflow-hidden rounded-lg border border-[#333] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <OgImage />
      </div>

      <p className="text-[13px] text-[#666]">Thumbnail preview (~400px wide):</p>
      <div className="h-[210px] w-[400px] overflow-hidden rounded-md border border-[#333]">
        <div className="w-[1200px] origin-top-left scale-[0.333]">
          <OgImage />
        </div>
      </div>
    </div>
  );
}
