import { ScrollectLogo } from "@/components/scrollect-logo";

import { OgImageShell } from "./og-image-shell";

/**
 * Version B: "Remember everything you read" - Light, editorial, contrarian.
 * Right side: a mini learning feed showing the product concept -
 * bite-sized posts with source indicators, like a social media feed.
 */
export function OgImage() {
  return (
    <OgImageShell testId="og-image" className="bg-[#f8fafb] text-[#1a1d2e]">
      {/* Content */}
      <div className="relative z-10 flex h-full w-full p-[56px]">
        {/* Left: text */}
        <div className="flex w-[540px] shrink-0 flex-col justify-between">
          {/* Wordmark - horizontal */}
          <div className="flex items-center gap-[8px]">
            <ScrollectLogo size="xl" className="text-[#1a1d2e]" />
            <span
              className="text-[#1a1d2e]"
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 42,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Scrollect
            </span>
          </div>

          {/* Headline + subline */}
          <div className="flex flex-col gap-[20px]">
            <h1 className="m-0 text-[74px] font-extrabold leading-[0.95] tracking-[-0.03em]">
              <span className="text-[#0d8b8a]">Remember</span>
              <br />
              <span className="text-[#0d8b8a]">everything</span>
              <br />
              <span className="text-[#1a1d2e]">you read.</span>
            </h1>
            <p className="m-0 max-w-[440px] text-[22px] font-normal leading-[1.45] text-[#6b7580]">
              AI turns your saved content into a curated learning feed.
            </p>
          </div>

          {/* Bottom brand */}
          <div className="flex items-center gap-[12px]">
            <div className="h-[3px] w-[28px] rounded-full bg-[#0d8b8a]" />
            <span
              className="text-xl font-medium tracking-[0.02em] text-[#6b7580]"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              scrollect.ai
            </span>
          </div>
        </div>

        {/* Right: mini learning feed */}
        <div className="relative flex flex-1 items-center justify-center">
          {/* Radial teal glow behind feed */}
          <div className="pointer-events-none absolute left-[80px] top-[60px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(ellipse,rgba(13,139,138,0.06)_0%,transparent_65%)]" />

          {/* Feed container - looks like a phone/app frame */}
          <div className="relative flex w-[520px] flex-col gap-[16px] rounded-[20px] border border-[#e2e6e9] bg-white/80 p-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            {/* Post 1 - PDF source */}
            <FeedPost
              sourceColor="#e74c3c"
              sourceLabel="PDF"
              titleWidth="75%"
              bodyWidths={["90%", "60%"]}
            />

            {/* Post 2 - Article source - highlighted as "active" */}
            <FeedPost
              sourceColor="#0d8b8a"
              sourceLabel="Article"
              titleWidth="60%"
              bodyWidths={["85%", "70%", "45%"]}
              highlighted
            />

            {/* Post 3 - Video source */}
            <FeedPost
              sourceColor="#dbb14e"
              sourceLabel="Video"
              titleWidth="65%"
              bodyWidths={["80%", "55%"]}
            />

            {/* Fade hint - more posts below */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[50px] rounded-b-[20px] bg-[linear-gradient(transparent,white)]" />
          </div>
        </div>
      </div>
    </OgImageShell>
  );
}

function FeedPost({
  sourceColor,
  sourceLabel,
  titleWidth,
  bodyWidths,
  highlighted = false,
}: {
  sourceColor: string;
  sourceLabel: string;
  titleWidth: string;
  bodyWidths: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-[10px] rounded-[12px] border p-[16px] ${
        highlighted
          ? "border-[#0d8b8a]/20 bg-white shadow-[0_4px_16px_rgba(13,139,138,0.06)]"
          : "border-[#edf0f2] bg-[#fafbfc]"
      }`}
    >
      {/* Source badge */}
      <div className="flex items-center gap-[8px]">
        <div className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: sourceColor }} />
        <span className="text-[11px] font-medium text-[#94a0aa]">{sourceLabel}</span>
      </div>
      {/* Title skeleton */}
      <div className="h-[8px] rounded-full bg-[#d0d5da]" style={{ width: titleWidth }} />
      {/* Body skeletons */}
      {bodyWidths.map((w, i) => (
        <div key={i} className="h-[6px] rounded-full bg-[#e2e6e9]" style={{ width: w }} />
      ))}
    </div>
  );
}
