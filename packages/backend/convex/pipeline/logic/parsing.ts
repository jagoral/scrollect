import type { ParsingServiceContext, PollResult } from "../../providers/types";

export type SubmitParsingResult = {
  checkUrl: string;
};

export type InterpretedPollResult =
  | { status: "complete"; markdown: string }
  | { status: "pending" }
  | { status: "error"; errorMessage: string }
  | { status: "timeout" };

export async function submitForParsing({
  fileUrl,
  services,
}: {
  fileUrl: string;
  services: ParsingServiceContext;
}): Promise<SubmitParsingResult> {
  const checkUrl = await services.parser.submit(fileUrl);
  return { checkUrl };
}

export function interpretPollResult({
  pollResult,
  elapsedMs,
  maxDurationMs,
}: {
  pollResult: PollResult;
  elapsedMs: number;
  maxDurationMs: number;
}): InterpretedPollResult {
  if (elapsedMs > maxDurationMs) {
    return { status: "timeout" };
  }

  if (pollResult.status === "complete") {
    if (!pollResult.markdown) {
      return { status: "error", errorMessage: "Parser returned complete but no markdown" };
    }
    return { status: "complete", markdown: pollResult.markdown };
  }

  if (pollResult.status === "error") {
    return {
      status: "error",
      errorMessage: pollResult.errorMessage ?? "Document parsing failed",
    };
  }

  return { status: "pending" };
}
