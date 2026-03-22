# Lighthouse Performance Improvements Log

Target: Performance >= 90 | URL: http://localhost:3000/ | Preset: desktop

## Baseline (pre-optimization)

| Run | Perf | A11y | BP  | SEO | FCP    | LCP    | SI     | TBT | CLS    |
| --- | ---- | ---- | --- | --- | ------ | ------ | ------ | --- | ------ |
| 1   | 78   | 100  | 100 | 100 | 2068ms | 2185ms | 2068ms | 8ms | 0.0057 |
| 2   | 77   | 100  | 100 | 100 | 2130ms | 2213ms | 2130ms | 3ms | 0.0057 |
| 3   | 77   | 100  | 100 | 100 | 2130ms | 2210ms | 2130ms | 4ms | 0.0057 |

**Median: Perf 77 | FCP 2130ms | LCP 2210ms | SI 2130ms | TBT 4ms | CLS 0.006**

Key bottlenecks:

- FCP/LCP/SI all ~2.1-2.2s (loading-bound, not interaction-bound)
- 1,557 KiB uncompressed assets (no gzip/brotli on Nitro server)
- 1.6 MiB monolithic main JS bundle
- PostHog (~150-200 KiB) loaded eagerly in critical path
- Blocking `getSession()` call on all routes including landing page

---

## Change 1: Enable Nitro `compressPublicAssets: true`

**What**: Added `compressPublicAssets: true` to `nitro()` plugin in `apps/web/vite.config.ts`. Nitro pre-compresses all static assets with brotli (.br) and gzip (.gz) at build time. The built-in static handler serves compressed variants when `Accept-Encoding` matches.

**Impact**: Main bundle dropped from 1.6 MiB to 383 KiB (brotli). CSS from 213 KiB to ~40 KiB.

| Run | Perf | A11y | BP  | SEO | FCP   | LCP   | SI    | TBT | CLS    |
| --- | ---- | ---- | --- | --- | ----- | ----- | ----- | --- | ------ |
| 1   | 98   | 100  | 100 | 100 | 899ms | 979ms | 899ms | 4ms | 0.0057 |
| 2   | 98   | 100  | 100 | 100 | 890ms | 970ms | 890ms | 3ms | 0.0057 |
| 3   | 98   | 100  | 100 | 100 | 892ms | 972ms | 892ms | 5ms | 0.0057 |

**Median: Perf 98 (+21) | FCP 892ms (-58%) | LCP 972ms (-56%) | SI 892ms (-58%)**

**Finding**: Compression alone was the dominant bottleneck. The 1.6 MiB uncompressed bundle was the root cause of all loading metric failures. With brotli, all metrics now comfortably exceed the 90 threshold.

---

## Change 2: Review feedback fixes

**What**:

- Raised Lighthouse CI thresholds from 0.8 to 0.9 (0.8 left too much slack with score at 98). Accessibility set to 1.0.
- Removed `@fontsource/geist-sans/latin-800.css` from global `index.css` (dead weight - only used by OG image capture script). Moved to `dev.og-preview.tsx` route scope.

| Run | Perf | A11y | BP  | SEO | FCP   | LCP   | SI    | TBT  | CLS    |
| --- | ---- | ---- | --- | --- | ----- | ----- | ----- | ---- | ------ |
| 1   | 98   | 100  | 100 | 100 | 897ms | 977ms | 897ms | 17ms | 0.0057 |
| 2   | 98   | 100  | 100 | 100 | 889ms | 969ms | 889ms | 6ms  | 0.0057 |
| 3   | 98   | 100  | 100 | 100 | 893ms | 979ms | 893ms | 2ms  | 0.0057 |

**Median: Perf 98 (stable) | FCP 893ms | LCP 977ms | SI 893ms**

**Finding**: No regression from removing the unused font weight. Scores remain stable.

---

## Final Summary

| Metric      | Baseline | Final | Change |
| ----------- | -------- | ----- | ------ |
| Performance | 77       | 98    | +21    |
| FCP         | 2130ms   | 893ms | -58%   |
| LCP         | 2210ms   | 977ms | -56%   |
| Speed Index | 2130ms   | 893ms | -58%   |
| TBT         | 4ms      | 6ms   | stable |
| CLS         | 0.006    | 0.006 | stable |

Single dominant fix: `compressPublicAssets: true` in Nitro config.
