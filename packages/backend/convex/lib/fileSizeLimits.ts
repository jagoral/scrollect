const MB = 1024 * 1024;

export const FILE_SIZE_LIMITS = {
  pdf: 50 * MB,
  epub: 10 * MB,
  md: 5 * MB,
  text: 5 * MB,
} as const;

export type UploadFileType = keyof typeof FILE_SIZE_LIMITS;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export function getFileSizeLimit(fileType: string): number | undefined {
  if (fileType in FILE_SIZE_LIMITS) {
    return FILE_SIZE_LIMITS[fileType as UploadFileType];
  }
  return undefined;
}
