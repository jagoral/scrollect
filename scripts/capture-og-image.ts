import { chromium } from "playwright";

const DEV_URL = "http://localhost:3000/dev/og-preview";
const OUTPUT_PATH = "apps/web/public/og-image.png";

async function captureOgImage() {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log(`Navigating to ${DEV_URL}...`);
  await page.goto(DEV_URL);
  await page.waitForLoadState("networkidle");

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);

  const el = page.getByTestId("og-image").first();
  await el.screenshot({ path: OUTPUT_PATH, scale: "css", type: "png" });

  console.log(`Captured OG image to ${OUTPUT_PATH}`);

  await browser.close();
}

captureOgImage().catch((err) => {
  console.error("Failed to capture OG image:", err);
  process.exit(1);
});
