import TurndownService from "turndown";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Remove style/script blocks entirely
turndown.remove(["style", "script"]);

function cleanHtml(html: string): string {
  // Remove <style> blocks
  let cleaned = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Unwrap <bdt> tags (Termly artifact) - keep inner content
  cleaned = cleaned.replace(/<bdt[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/bdt>/gi, "");
  // Remove inline styles
  cleaned = cleaned.replace(/\s*style="[^"]*"/gi, "");
  // Remove data-custom-class attributes
  cleaned = cleaned.replace(/\s*data-custom-class="[^"]*"/gi, "");
  // Remove class attributes
  cleaned = cleaned.replace(/\s*class="[^"]*"/gi, "");
  // Remove id attributes
  cleaned = cleaned.replace(/\s*id="[^"]*"/gi, "");
  // Remove data-id attributes
  cleaned = cleaned.replace(/\s*data-id="[^"]*"/gi, "");
  // Remove empty anchor tags
  cleaned = cleaned.replace(/<a\s*name="[^"]*"\s*><\/a>/gi, "");
  // Remove empty spans
  cleaned = cleaned.replace(/<span\s*>\s*<\/span>/gi, "");
  // Remove document-previewer wrapper
  cleaned = cleaned.replace(/<div[^>]*document-previewer[^>]*>/gi, "<div>");
  return cleaned;
}

function cleanMarkdown(md: string): string {
  let cleaned = md;
  // Remove excessive blank lines (more than 2 consecutive)
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n");
  // Remove trailing whitespace on lines
  cleaned = cleaned.replace(/[ \t]+$/gm, "");
  // Clean up heading hierarchy - ensure no orphan formatting
  cleaned = cleaned.replace(/\*\*\*\*/g, "");
  // Remove empty bold markers
  cleaned = cleaned.replace(/\*\*\s*\*\*/g, "");
  // Clean up consecutive underscores (placeholders)
  cleaned = cleaned.replace(/_{5,}/g, "__________");
  return cleaned.trim() + "\n";
}

const files = [
  {
    input: "privacy-policy.txt",
    output: "apps/web/src/content/legal/privacy-policy.md",
  },
  {
    input: "toc.txt",
    output: "apps/web/src/content/legal/terms-and-conditions.md",
  },
];

const root = join(new URL(".", import.meta.url).pathname, "..");

for (const file of files) {
  const html = readFileSync(join(root, file.input), "utf-8");
  const cleanedHtml = cleanHtml(html);
  const markdown = turndown.turndown(cleanedHtml);
  const cleanedMd = cleanMarkdown(markdown);
  writeFileSync(join(root, file.output), cleanedMd);
  console.log(`Converted ${file.input} -> ${file.output}`);
}
