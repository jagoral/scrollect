import { cn } from "@/lib/utils";

export function CtaBackground({ className }: { className?: string }) {
  return (
    <img
      src="/cta-network.svg"
      alt=""
      aria-hidden="true"
      width={1440}
      height={400}
      loading="lazy"
      className={cn(className)}
    />
  );
}
