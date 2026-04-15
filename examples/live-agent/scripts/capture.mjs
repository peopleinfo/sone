import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const FRONTEND = "http://127.0.0.1:5173";
const OUTPUT = resolve(PROJECT_ROOT, "capture.png");
const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.log("1. Launching browser ...");
  const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || DEFAULT_CHROME_PATH;

  if (!existsSync(executablePath)) {
    throw new Error(
      `Chrome executable not found at ${executablePath}. Set PLAYWRIGHT_CHROME_PATH to a local Chrome or Chromium binary.`,
    );
  }

  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  const url = `${FRONTEND}/capture.html?fixture=1`;
  page.on("console", (msg) => console.log(`   [browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`   [browser error] ${err.message}`));

  console.log("2. Loading capture page ...");
  await page.goto(url, { waitUntil: "networkidle" });

  // Wait for Sone to finish rendering or capture an error
  console.log("3. Waiting for render ...");
  await page.waitForFunction(
    () => window.__captureReady === true || window.__captureError,
    null,
    { timeout: 20000 },
  );

  const captureError = await page.evaluate(() => window.__captureError);
  if (captureError) {
    console.error(`   Render error: ${captureError}`);
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(500);

  // Screenshot the canvas
  const canvas = page.locator("#capture-canvas");
  const box = await canvas.boundingBox();
  if (box) {
    console.log(`   Canvas: ${Math.round(box.width)}x${Math.round(box.height)}px`);
    await canvas.screenshot({ path: OUTPUT });
  } else {
    await page.screenshot({ path: OUTPUT });
  }

  console.log(`4. Saved to ${OUTPUT}`);
  await browser.close();
  console.log("Done!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
