const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { BASE, PKG_ROOT, waitForFedExLogo } = require('./screenshot-utils');

const OUT = path.join(PKG_ROOT, 'Brand');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/eula.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('ta_fedex_eula_accepted', 'true');
    localStorage.setItem('ta_fedex_eula_version', 'v4_202406');
  });

  await page.goto(`${BASE}/settings.html`, { waitUntil: 'networkidle' });
  await waitForFedExLogo(page);
  await page.screenshot({
    path: path.join(OUT, '01_mfa_registration_step1.png'),
    fullPage: false,
  });

  await page.goto(`${BASE}/rates.html?storeId=rate-demo-case3190`, { waitUntil: 'networkidle' });
  await waitForFedExLogo(page);
  await page.waitForSelector('.rate-option', { timeout: 60000 });
  await page.screenshot({
    path: path.join(OUT, '02_shipping_rates_checkout.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('Saved brand/MFA UI screenshots to:', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
