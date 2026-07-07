const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { BASE, PKG_ROOT, waitForFedExLogo } = require('./screenshot-utils');

const OUT = path.join(PKG_ROOT, 'SWEDEN_MFA_BYPASS');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/eula.html`, { waitUntil: 'networkidle' });
  await waitForFedExLogo(page);
  await page.evaluate(() => {
    localStorage.setItem('ta_fedex_eula_accepted', 'true');
    localStorage.setItem('ta_fedex_eula_version', 'v4_202406');
  });

  await page.goto(`${BASE}/settings.html`, { waitUntil: 'networkidle' });
  await waitForFedExLogo(page);

  await page.fill('#accountNumber', '604849268');
  await page.fill('#customerName', 'TAloha Sweden Bypass');
  await page.fill('#street', 'HAGAGATAN 1, VI');
  await page.fill('#city', 'STOCKHOLM');
  await page.fill('#postalCode', '11349');
  await page.selectOption('#country', 'SE');
  await page.evaluate(() => {
    document.getElementById('state').value = '';
    document.getElementById('state').placeholder = '';
    if (typeof updateCountryFields === 'function') updateCountryFields();
  });
  await page.waitForTimeout(300);
  await waitForFedExLogo(page);

  await page.screenshot({
    path: path.join(OUT, '01_step1_sweden_filled.png'),
    fullPage: false,
  });

  await page.click('#step1Btn');
  await page.waitForSelector('#step3.active', { timeout: 30000 });
  await page.waitForTimeout(500);
  await waitForFedExLogo(page);

  await page.screenshot({
    path: path.join(OUT, '02_step3_mfa_bypass_success.png'),
    fullPage: true,
  });

  await browser.close();
  console.log('Saved Sweden MFA bypass screenshots to:', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
