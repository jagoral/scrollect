// `scrollect.app` is additionally accepted because Polar validates billing
// emails via DNS and rejects `test.scrollect.dev` (no A/MX records). The
// billing E2E spec signs up under `scrollect.app` so checkout can proceed.
export const E2E_EMAIL_PATTERN = /^e2e-.*@(test\.scrollect\.dev|scrollect\.app)$/;

export function isE2EEnabled(): boolean {
  return process.env.ENABLE_E2E_ROUTES === "true";
}
