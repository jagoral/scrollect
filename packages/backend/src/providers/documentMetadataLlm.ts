import { z } from "zod";

import type { DocumentMetadataLlm } from "./types";
import { type TokenUsage, generate } from "./ai";
import { buildLanguageInstruction } from "./promptUtils";
import { cleanDocumentTitle, firstChunkTitleContext } from "../pipeline/logic/documentMetadata";

const titleSchema = z.object({
  title: z.string().nullable(),
});

function buildTitlePrompt(language?: string): string {
  return `You identify document titles for a personal learning app.
The user uploaded a PDF or EPUB. The parser could not provide a reliable metadata title, so infer the document title from the first content chunk.

Rules:
- Return the exact title if it is visible in the chunk
- Prefer the book, paper, article, or report title over chapter or section titles
- Do not invent a title
- Return null when the chunk does not contain a clear document title
- Do not return generic labels like "Document", "Untitled", "Introduction", or "Chapter 1"
- ${buildLanguageInstruction(language)}

Return a JSON object: { "title": "..." } or { "title": null }`;
}

export class AiSdkDocumentMetadataLlm implements DocumentMetadataLlm {
  async inferTitle(opts: {
    firstChunk: string;
    currentTitle: string;
    fileType: string;
    language?: string;
  }): Promise<{ title?: string; usage: TokenUsage }> {
    const { output, usage } = await generate({
      model: "fast",
      schema: titleSchema,
      system: buildTitlePrompt(opts.language),
      prompt: `File type: ${opts.fileType}
Current title, usually from the filename: ${opts.currentTitle}

First chunk:
${firstChunkTitleContext(opts.firstChunk)}`,
      temperature: 0,
    });

    return {
      title: cleanDocumentTitle(output?.title),
      usage,
    };
  }
}
