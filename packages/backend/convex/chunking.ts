const TARGET_CHUNK_SIZE = 750;
const CHUNK_OVERLAP = 50;
const MIN_CHUNK_SIZE = 100;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkContent(text: string): { content: string; tokenCount: number }[] {
  const chunks: { content: string; tokenCount: number }[] = [];
  if (!text.trim()) return chunks;

  const totalTokens = estimateTokens(text);
  if (totalTokens <= TARGET_CHUNK_SIZE + MIN_CHUNK_SIZE) {
    return [{ content: text.trim(), tokenCount: estimateTokens(text.trim()) }];
  }

  const charChunkSize = TARGET_CHUNK_SIZE * 4;
  const charOverlap = CHUNK_OVERLAP * 4;
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + charChunkSize, text.length);

    if (end < text.length) {
      const searchStart = Math.max(end - 200, start);
      const segment = text.slice(searchStart, end + 200);

      const breakPoints = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];
      let bestBreak = -1;

      for (const bp of breakPoints) {
        const idx = segment.lastIndexOf(bp, end - searchStart);
        if (idx !== -1) {
          bestBreak = searchStart + idx + bp.length;
          break;
        }
      }

      if (bestBreak > start) {
        end = bestBreak;
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push({ content: chunkText, tokenCount: estimateTokens(chunkText) });
    }

    if (end >= text.length) break;
    start = end - charOverlap;
  }

  return chunks;
}

export function chunkMarkdown(text: string): { content: string; tokenCount: number }[] {
  const headingPattern = /\n(?=#{1,3} )/;
  const sections = text.split(headingPattern).filter((s) => s.trim());

  const chunks: { content: string; tokenCount: number }[] = [];

  for (const section of sections) {
    const tokens = estimateTokens(section);
    if (tokens <= TARGET_CHUNK_SIZE + MIN_CHUNK_SIZE) {
      const trimmed = section.trim();
      if (trimmed) {
        chunks.push({ content: trimmed, tokenCount: estimateTokens(trimmed) });
      }
    } else {
      chunks.push(...chunkContent(section));
    }
  }

  return chunks;
}
