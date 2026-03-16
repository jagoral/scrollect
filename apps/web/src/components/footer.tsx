import { Link } from "@tanstack/react-router";

const LINK_CLASSES =
  "text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none";

export default function Footer() {
  return (
    <footer className="mt-auto border-t px-4 py-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          &copy; {new Date().getFullYear()} Scrollect. All rights reserved.
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link to="/privacy-policy" className={LINK_CLASSES}>
            Privacy Policy
          </Link>
          <Link to="/terms-and-conditions" className={LINK_CLASSES}>
            Terms & Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
