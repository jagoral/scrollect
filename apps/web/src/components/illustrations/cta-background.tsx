import { cn } from "@/lib/utils";

export function CtaBackground({ className }: { className?: string }) {
  return <img src="/cta-network.svg" alt="" aria-hidden="true" className={cn(className)} />;
}
