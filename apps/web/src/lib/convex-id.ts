const CONVEX_ID_PATTERN = /^[a-z0-9]{20,}$/;

export function looksLikeConvexId(value: string): boolean {
  return CONVEX_ID_PATTERN.test(value);
}
