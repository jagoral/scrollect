const MB = 1024 * 1024;

export const FILE_SIZE_LIMITS_PRO = {
  pdf: 50 * MB,
  epub: 30 * MB,
  md: 5 * MB,
  text: 5 * MB,
} as const;

export const FILE_SIZE_LIMITS_FREE = {
  pdf: 10 * MB,
  epub: 5 * MB,
  md: 1 * MB,
  text: 1 * MB,
} as const;

// Legacy export - equivalent to the Pro limits. Keep for callers that are not yet tier-aware.
export const FILE_SIZE_LIMITS = FILE_SIZE_LIMITS_PRO;

export type UploadFileType = keyof typeof FILE_SIZE_LIMITS_PRO;
export type FileSizeTier = "free" | "pro";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export function getFileSizeLimits(tier: FileSizeTier) {
  return tier === "pro" ? FILE_SIZE_LIMITS_PRO : FILE_SIZE_LIMITS_FREE;
}

export function getFileSizeLimit(fileType: string, tier: FileSizeTier = "pro"): number | undefined {
  const table = getFileSizeLimits(tier);
  if (fileType in table) {
    return table[fileType as UploadFileType];
  }
  return undefined;
}
