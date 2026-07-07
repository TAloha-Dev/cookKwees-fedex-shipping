const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { BASE, PKG_ROOT, waitForFedExLogo, ensureRateDemoMerchant } = require('./screenshot-utils');

const STORE_ID = 'rate-demo-case3190';
const OUT = path.join(PKG_ROOT, 'Rate');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const request = context.request;

  console.log('Registering rate demo merchant...');
  await ensureRateDemoMerchant(request, STORE_ID);

  const url = `${BASE}/rates.html?storeId=${encodeURIComponent(STORE_ID)}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitForFedExLogo(page);

  await page.waitForFunction(() => {
    const area = document.getElementById('rateArea');
    return area && !area.textContent.includes('Loading FedEx rates');
  }, { timeout: 60000 });

  const hasRates = await page.$('.rate-option');
  if (!hasRates) {
    const errText = await page.textContent('#errorArea');
    const rateText = await page.textContent('#rateArea');
    throw new Error(`Rates did not render. error=${errText || 'none'} rateArea=${rateText || 'empty'}`);
  }
  await page.waitForFunction(() => {
    return document.body.textContent.includes('26.78') ||
           document.body.textContent.includes('$26.78');
  }, { timeout: 15000 }).catch(() => {
    console.warn('Warning: $26.78 not found in page — saving screenshot anyway');
  });

  await waitForFedExLogo(page);
  await page.screenshot({
    path: path.join(OUT, '01_rate_ui_26_78.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('Saved rate screenshot to:', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
