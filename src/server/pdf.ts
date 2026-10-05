import "server-only";
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

// Local Chrome for development. On Vercel, /replica-deploy switches this to
// @sparticuz/chromium (see replica/architecture.md).
const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

const g = globalThis as unknown as { __pdfBrowser?: Promise<Browser> };

/** One shared Chrome. If it dies or disconnects, the next export launches a new one. */
async function browser(): Promise<Browser> {
  const cached = g.__pdfBrowser && (await g.__pdfBrowser.catch(() => null));
  if (cached?.connected) return cached;
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
  const launching = puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
  g.__pdfBrowser = launching;
  const b = await launching.catch((e) => {
    g.__pdfBrowser = undefined;
    throw e;
  });
  b.on("disconnected", () => {
    if (g.__pdfBrowser === launching) g.__pdfBrowser = undefined;
  });
  return b;
}

export async function renderPdf(url: string, pageSize: "letter" | "a4"): Promise<Uint8Array> {
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    if (!(await page.$("[data-print-ready]"))) throw new Error("Print page did not render");
    return await page.pdf({ format: pageSize === "a4" ? "A4" : "Letter", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}
