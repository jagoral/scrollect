import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { BookMarked, Loader2, Upload } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { parsePocketbookHtml, type ParsedHighlight } from "@/lib/pocketbook-parser";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface ImportHighlightsDialogProps {
  documentId: Id<"documents">;
}

export function ImportHighlightsDialog({ documentId }: ImportHighlightsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseResult, setParseResult] = useState<{
    highlights: ParsedHighlight[];
    errors: string[];
    title: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importHighlights = useMutation(api.highlights.importHighlights);
  const posthog = usePostHog();

  const resetState = () => {
    setParseResult(null);
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      toast.error("Please select an HTML file exported from Pocketbook.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const html = reader.result as string;
      const result = parsePocketbookHtml(html);
      setParseResult(result);

      if (result.highlights.length === 0) {
        const errorMsg = result.errors[0] ?? "No highlights found in the file";
        toast.error(errorMsg);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.highlights.length === 0) return;

    setIsImporting(true);
    try {
      const result = await importHighlights({
        documentId,
        source: "pocketbook",
        highlights: parseResult.highlights,
      });

      posthog.capture("highlights.imported", {
        source: "pocketbook",
        count: result.imported,
        skipped: result.skipped,
      });

      if (result.imported > 0) {
        toast.success(
          `Imported ${result.imported} highlight${result.imported !== 1 ? "s" : ""}` +
            (result.skipped > 0 ? ` (${result.skipped} already existed)` : ""),
        );
      } else {
        toast.info("All highlights were already imported.");
      }

      setOpen(false);
      resetState();
    } catch {
      toast.error("Failed to import highlights");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isImporting) {
          setOpen(nextOpen);
          if (!nextOpen) resetState();
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" size="sm" data-testid="import-highlights-button" />}
      >
        <BookMarked data-icon="inline-start" />
        Import highlights
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Pocketbook highlights</DialogTitle>
          <DialogDescription>
            Import your reading highlights and notes from a Pocketbook e-reader export.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="border border-border bg-transparent p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              How to export notes from Pocketbook
            </p>
            <ol className="list-inside list-decimal flex flex-col gap-1 text-xs text-muted-foreground">
              <li>Login to Pocketbook Cloud</li>
              <li>Open a book you want notes export from</li>
              <li>Click on the Notes icon</li>
              <li>Click on the Export Notes button</li>
            </ol>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              onChange={handleFileChange}
              className="hidden"
              data-testid="highlights-file-input"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              data-testid="select-highlights-file"
            >
              <Upload data-icon="inline-start" />
              {parseResult
                ? `${parseResult.highlights.length} highlight${parseResult.highlights.length !== 1 ? "s" : ""} found`
                : "Select exported HTML file"}
            </Button>
          </div>

          {parseResult && parseResult.errors.length > 0 && parseResult.highlights.length > 0 && (
            <p className="text-xs text-amber-600">
              {parseResult.errors.length} bookmark{parseResult.errors.length !== 1 ? "s" : ""} could
              not be parsed and will be skipped.
            </p>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button
            onClick={handleImport}
            disabled={isImporting || !parseResult || parseResult.highlights.length === 0}
            data-testid="confirm-import-highlights"
          >
            {isImporting && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Import
            {parseResult && parseResult.highlights.length > 0
              ? ` ${parseResult.highlights.length} highlight${parseResult.highlights.length !== 1 ? "s" : ""}`
              : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
