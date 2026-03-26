const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    let candidate: string | null = null;

    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/")[1] ?? null;
    }
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      if (url.pathname.startsWith("/watch")) {
        candidate = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/shorts/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/embed/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/v/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/live/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      }
    }

    const trimmed = candidate?.trim() ?? "";
    return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return (
      hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be"
    );
  } catch {
    const lower = rawUrl.toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
  }
}

export function formatTimestampMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function normalizeTranscriptText(input: string): string {
  return input
    .replaceAll("\u00A0", " ")
    .replaceAll(/[\t ]+/g, " ")
    .replaceAll(/\s*\n\s*/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export interface TranscriptSegment {
  startMs: number;
  endMs?: number | null;
  text: string;
}
