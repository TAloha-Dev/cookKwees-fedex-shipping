const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { BASE, PKG_ROOT, waitForFedExLogo } = require('./screenshot-utils');

const OUT = path.join(PKG_ROOT, 'Fallback');

(async () => {
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
  await page.evaluate(() => {
    const msg = 'We are unable to process this request. Please try again later or call FedEx Customer Service and ask for technical support.';
    document.getElementById('alertArea').innerHTML = '<div class="alert alert-error">' + msg + '</div>';
  });
  await page.waitForTimeout(300);
  await waitForFedExLogo(page);

  await page.screenshot({
    path: path.join(OUT, '01_customer_service_fallback.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('Saved fallback screenshot');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
