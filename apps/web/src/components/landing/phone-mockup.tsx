import { useEffect, useState } from "react";

import {
  PreviewConnectionCard,
  PreviewInsightCard,
  PreviewQuizCard,
  PreviewQuoteCard,
  PreviewSummaryCard,
} from "./preview-cards";

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function PhoneMockup() {
  const [time, setTime] = useState("9:41");

  useEffect(() => {
    setTime(formatTime());
    const interval = setInterval(() => setTime(formatTime()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mx-auto w-64 md:w-72 lg:w-80">
      {/* Hardware buttons - left */}
      <div className="absolute -left-[2px] top-[17%] h-6 w-[3px] rounded-l-full bg-[#2c2c2e] dark:bg-[#58585a]" />
      <div className="absolute -left-[2px] top-[24%] h-10 w-[3px] rounded-l-full bg-[#2c2c2e] dark:bg-[#58585a]" />
      <div className="absolute -left-[2px] top-[31%] h-10 w-[3px] rounded-l-full bg-[#2c2c2e] dark:bg-[#58585a]" />
      {/* Hardware button - right */}
      <div className="absolute -right-[2px] top-[26%] h-14 w-[3px] rounded-r-full bg-[#2c2c2e] dark:bg-[#58585a]" />

      {/* Ambient glow */}
      <div className="absolute -inset-8 -z-10 rounded-[4rem] bg-primary/10 blur-3xl" />
      <div className="absolute -inset-16 -z-10 rounded-[5rem] bg-primary/5 blur-[64px]" />

      {/* Phone body - titanium frame */}
      <div className="phone-frame relative rounded-[2.75rem] p-[2px]">
        {/* Black bezel - thin uniform gap */}
        <div className="relative overflow-hidden rounded-[2.6rem] bg-black p-[5px]">
          {/* Screen - edge to edge with rounded corners */}
          <div className="relative overflow-hidden rounded-[2.25rem] bg-background">
            {/* Dynamic Island - overlaid on screen */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-[10px]">
              <div className="flex h-[28px] w-[105px] items-center justify-between rounded-full bg-black px-4">
                <div className="h-[8px] w-[8px] rounded-full bg-[#1a1a1e] ring-1 ring-white/[0.04]" />
                <div className="h-[5px] w-[5px] rounded-full bg-[#0e2f2e] ring-1 ring-white/[0.03]" />
              </div>
            </div>

            {/* Status bar - flanks the Dynamic Island */}
            <div className="pointer-events-none relative z-20 flex items-center justify-between px-6 pt-[14px] pb-1 text-[10px] font-semibold text-foreground/60">
              <span>{time}</span>
              <span className="flex items-center gap-1">
                <svg
                  width="14"
                  height="10"
                  viewBox="0 0 14 10"
                  fill="currentColor"
                  className="opacity-60"
                >
                  <rect x="0" y="6" width="2.5" height="4" rx="0.5" />
                  <rect x="3.5" y="4" width="2.5" height="6" rx="0.5" />
                  <rect x="7" y="2" width="2.5" height="8" rx="0.5" />
                  <rect x="10.5" y="0" width="2.5" height="10" rx="0.5" />
                </svg>
                <svg
                  width="13"
                  height="10"
                  viewBox="0 0 13 10"
                  fill="currentColor"
                  className="opacity-60"
                >
                  <path d="M6.5 2.5C8.2 2.5 9.7 3.2 10.8 4.3L12 3.1C10.5 1.6 8.6 0.7 6.5 0.7S2.5 1.6 1 3.1L2.2 4.3C3.3 3.2 4.8 2.5 6.5 2.5Z" />
                  <path d="M6.5 5.3C7.6 5.3 8.6 5.7 9.4 6.5L10.6 5.3C9.5 4.2 8.1 3.5 6.5 3.5S3.5 4.2 2.4 5.3L3.6 6.5C4.4 5.7 5.4 5.3 6.5 5.3Z" />
                  <circle cx="6.5" cy="8.5" r="1.5" />
                </svg>
                <svg
                  width="20"
                  height="10"
                  viewBox="0 0 20 10"
                  fill="currentColor"
                  className="opacity-60"
                >
                  <rect
                    x="0"
                    y="1"
                    width="16"
                    height="8"
                    rx="1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  <rect x="16.5" y="3.5" width="2" height="3" rx="0.5" />
                  <rect x="1.5" y="2.5" width="10" height="5" rx="0.5" />
                </svg>
              </span>
            </div>

            {/* Screen content area - scrollable on md+ only */}
            <div
              role="region"
              aria-label="Phone mockup preview"
              tabIndex={0}
              className="relative h-[370px] overflow-hidden md:overflow-y-auto md:overscroll-contain md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden md:h-[430px] lg:h-[490px]"
            >
              <div className="animate-phone-scroll-hint flex flex-col gap-3 px-3 pt-4 pb-16">
                <PreviewInsightCard />
                <PreviewQuoteCard />
                <PreviewSummaryCard />
                <PreviewQuizCard />
                <PreviewConnectionCard />
              </div>
            </div>

            {/* Screen fades */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-gradient-to-b from-background via-background to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-background via-background/80 to-transparent" />

            {/* Glass reflection */}
            <div className="pointer-events-none absolute inset-0 z-20 opacity-[0.04] [background:linear-gradient(125deg,white_0%,white_20%,transparent_45%,transparent_100%)]" />

            {/* Home indicator - inside screen */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-[6px]">
              <div className="h-[4px] w-[96px] rounded-full bg-foreground/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
