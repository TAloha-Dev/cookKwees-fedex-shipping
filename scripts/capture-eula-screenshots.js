const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { BASE, PKG_ROOT, waitForFedExLogo } = require('./screenshot-utils');

const OUT = path.join(PKG_ROOT, 'EULA');
const PAGE_COUNT = 11;

async function scrollEulaBox(page, ratio) {
  await page.evaluate((r) => {
    const box = document.getElementById('eulaBox');
    const max = box.scrollHeight - box.clientHeight;
    box.scrollTop = Math.max(0, max * r);
  }, ratio);
  await page.waitForTimeout(350);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/eula.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('ta_fedex_eula_accepted');
    localStorage.removeItem('ta_fedex_eula_version');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForFedExLogo(page);

  for (let i = 0; i < PAGE_COUNT; i++) {
    const ratio = i / (PAGE_COUNT - 1);
    await scrollEulaBox(page, ratio);
    await waitForFedExLogo(page);
    const num = String(i + 1).padStart(2, '0');
    await page.screenshot({
      path: path.join(OUT, `${num}_eula_page_${num}.png`),
      fullPage: false,
    });
  }

  await scrollEulaBox(page, 1);
  await page.waitForFunction(() => !document.getElementById('acceptCheckbox').disabled, { timeout: 10000 });
  await waitForFedExLogo(page);
  await page.screenshot({
    path: path.join(OUT, '12_eula_acknowledgment_checkbox_enabled.png'),
    fullPage: false,
  });

  await page.check('#acceptCheckbox');
  await page.waitForFunction(() => !document.getElementById('continueBtn').disabled);
  await waitForFedExLogo(page);
  await page.screenshot({
    path: path.join(OUT, '13_eula_acknowledgment_accept_ready.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('Saved EULA screenshots to:', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
