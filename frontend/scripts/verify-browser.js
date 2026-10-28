import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('verification-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runVerification() {
  console.log('--- Starting Browser Verification ---');

  // Start Vite preview programmatically
  const previewServer = await preview({
    preview: {
      port: 4173,
      host: '127.0.0.1'
    }
  });

  const serverUrl = previewServer.resolvedUrls.local[0] || 'http://127.0.0.1:4173/';
  console.log(`Preview server listening at: ${serverUrl}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // 1. Desktop Test (1280x800)
    console.log('Testing Desktop view (1280x800)...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(serverUrl, { waitUntil: 'networkidle0' });

    // Verify Title & Header
    const title = await page.title();
    console.log(`Page title: "${title}"`);

    // Verify recommendations for Alex Rivera
    await page.waitForSelector('.activity-card', { timeout: 5000 });
    const cards = await page.$$('.activity-card');
    console.log(`Found ${cards.length} recommendation cards on desktop.`);

    const cardTitle = await page.$eval('.card-title', el => el.textContent.trim());
    const cardReason = await page.$eval('.reason-text', el => el.textContent.trim());
    console.log(`Top activity: "${cardTitle}"`);
    console.log(`Top reason: "${cardReason}"`);

    const desktopScreenshot = path.join(SCREENSHOT_DIR, 'desktop-student-selection.png');
    await page.screenshot({ path: desktopScreenshot, fullPage: true });
    console.log(`Saved screenshot: ${desktopScreenshot}`);

    // 2. Test Student Selection & Empty State (Zoe Walker)
    console.log('Selecting Zoe Walker (Empty state test)...');
    await page.select('#student-dropdown', 'student-empty');
    await page.waitForSelector('.empty-state', { timeout: 5000 });
    const emptyHeading = await page.$eval('.empty-state h3', el => el.textContent.trim());
    console.log(`Empty state rendered: "${emptyHeading}"`);

    const emptyScreenshot = path.join(SCREENSHOT_DIR, 'desktop-empty-state.png');
    await page.screenshot({ path: emptyScreenshot, fullPage: true });
    console.log(`Saved screenshot: ${emptyScreenshot}`);

    // 3. Test Live Mode Error State (backend offline)
    console.log('Switching to Live API mode to verify honest error state...');
    const switchButton = await page.$('aside.mode-banner button');
    if (switchButton) {
      await switchButton.click();
    }
    await page.waitForSelector('.error-alert', { timeout: 5000 });
    const errorMessage = await page.$eval('.error-alert .error-message', el => el.textContent.trim());
    const errorEndpoint = await page.$eval('.error-alert .error-details', el => el.textContent.trim());
    console.log(`Live mode honest error displayed: "${errorMessage}"`);
    console.log(`Attempted endpoint: "${errorEndpoint}"`);

    const errorScreenshot = path.join(SCREENSHOT_DIR, 'desktop-live-error-state.png');
    await page.screenshot({ path: errorScreenshot, fullPage: true });
    console.log(`Saved screenshot: ${errorScreenshot}`);

    // Click "Switch to Offline Mock Mode" in the error alert
    const backToMockBtn = await page.$('.error-alert .btn-secondary');
    if (backToMockBtn) {
      await backToMockBtn.click();
      await page.waitForSelector('#student-dropdown', { timeout: 5000 });
      // Select Alex Rivera
      await page.select('#student-dropdown', 'student-1');
      await page.waitForSelector('.activity-card', { timeout: 5000 });
      console.log('Successfully switched back to Mock Mode via Error Alert action button.');
    }

    // 4. Mobile Test (375x667)
    console.log('Testing Mobile view (375x667)...');
    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    await page.waitForSelector('.activity-card', { timeout: 5000 });
    const mobileCards = await page.$$('.activity-card');
    console.log(`Found ${mobileCards.length} recommendation cards on mobile viewport.`);
    const mobileScreenshot = path.join(SCREENSHOT_DIR, 'mobile-student-recommendations.png');
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    console.log(`Saved screenshot: ${mobileScreenshot}`);

    console.log('--- All Browser Verifications Succeeded! ---');
  } finally {
    await browser.close();
    await previewServer.close();
  }
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
