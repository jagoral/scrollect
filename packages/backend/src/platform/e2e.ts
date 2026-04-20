export const E2E_EMAIL_PATTERN = /^e2e-.*@test\.scrollect\.dev$/;

export function isE2EEnabled(): boolean {
  return process.env.ENABLE_E2E_ROUTES === "true";
}
