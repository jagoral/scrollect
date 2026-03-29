import { AlertCircle, ArrowUpCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

interface UpgradePromptProps {
  title: string;
  description: string;
  limitType: "documents" | "pages";
}

export function UpgradePrompt({ title, description, limitType }: UpgradePromptProps) {
  return (
    <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-500">
      {limitType === "documents" ? (
        <AlertCircle className="h-4 w-4" />
      ) : (
        <ArrowUpCircle className="h-4 w-4" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p>{description}</p>
        <Button asChild size="sm" className="w-fit bg-amber-500 hover:bg-amber-600 text-white">
          <Link to="/app/subscription">Upgrade to Pro</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
