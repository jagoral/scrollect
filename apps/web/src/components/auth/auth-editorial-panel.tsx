import { cn } from "@/lib/utils";

type AuthMode = "signin" | "signup";

const copy = {
  signin: {
    eyebrow: "Welcome back",
    heading: (
      <>
        Pick up where your <em className="not-italic text-primary">highlights</em> left off.
      </>
    ),
    body: "Your feed is already waiting. New posts, drawn from the books and articles you saved.",
  },
  signup: {
    eyebrow: "Start remembering",
    heading: (
      <>
        Your <em className="not-italic text-primary">personal</em> learning feed starts here.
      </>
    ),
    body: "Save books, articles, and PDFs. Scrollect turns them into a scrollable feed of bite-sized posts you'll actually remember.",
  },
} as const;

export function AuthEditorialPanel({ mode }: { mode: AuthMode }) {
  const content = copy[mode];

  return (
    <aside
      className={cn(
        "relative flex flex-col justify-between overflow-hidden border-b border-border bg-card",
        "px-5 py-10 sm:px-8",
        "md:border-b-0 md:border-r md:py-14",
        "md:pl-[max(2rem,calc((100vw-64rem)/2))] md:pr-12 lg:pr-16 lg:py-20",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-32 size-72 rounded-full bg-primary/15 blur-3xl md:size-96"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-[-10%] hidden size-80 rounded-full bg-primary/[0.06] blur-3xl md:block"
      />

      <div className="relative z-10 flex items-center gap-2.5 text-muted-foreground">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.32em]">
          {content.eyebrow}
        </span>
      </div>

      <div
        key={mode}
        className="relative z-10 mt-8 max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-500 md:mt-0"
      >
        <h2 className="font-logo text-4xl font-semibold leading-[1.02] tracking-[-0.02em] text-balance sm:text-5xl md:text-[3.25rem] md:leading-[1.02] lg:text-[3.75rem] lg:leading-[1]">
          {content.heading}
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground text-pretty md:mt-6 md:text-lg md:leading-[1.55]">
          {content.body}
        </p>
      </div>

      <div className="relative z-10 mt-10 hidden flex-col gap-4 md:flex">
        <div className="h-px w-16 bg-border" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground/70">
          Free during beta · No credit card
        </span>
      </div>
    </aside>
  );
}
