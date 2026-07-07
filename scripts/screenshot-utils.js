const path = require('path');

const BASE = 'https://cook-kwees-fedex-shipping.vercel.app';
const CASE_ID = '00003201';
const PKG_ROOT = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  `TAloha_FedEx_Validation_Case${CASE_ID}`,
  'Screenshots'
);

async function waitForFedExLogo(page) {
  await page.waitForSelector('.fedex-logo-wrap img', { state: 'visible', timeout: 15000 });
  await page.waitForResponse(
    (r) => r.url().includes('Logo.png') && r.status() === 200,
    { timeout: 15000 }
  ).catch(() => null);
  await page.waitForFunction(() => {
    const img = document.querySelector('.fedex-logo-wrap img');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(200);
}

async function ensureRateDemoMerchant(request, storeId) {
  const addressBody = {
    storeId,
    accountNumber: '700257037',
    customerName: 'TAloha Rate Validation',
    address: {
      street: '15 W 18TH ST FL 7',
      city: 'NEW YORK',
      stateOrProvinceCode: 'NY',
      postalCode: '100114624',
      countryCode: 'US',
    },
  };

  const addrRes = await request.post(`${BASE}/api/register/address`, { data: addressBody });
  const addrData = await addrRes.json();

  if (addrData.mfaBypass) return;

  const token = addrData.accountAuthToken || addrData.mfaOptions?.[0]?.accountAuthToken;
  if (!token) throw new Error('Address validation did not return accountAuthToken');

  const invoiceRes = await request.post(`${BASE}/api/register/invoice-validate`, {
    data: {
      ...addressBody,
      accountAuthToken: token,
      invoiceDetail: {
        number: '234562278',
        currency: 'USD',
        amount: '234.00',
        date: '2026-05-15',
      },
      locale: 'en_US',
    },
  });
  const invoiceData = await invoiceRes.json();
  if (!invoiceData.success) {
    throw new Error(invoiceData.error || 'Invoice validation failed for rate demo merchant');
  }
}

module.exports = { BASE, CASE_ID, PKG_ROOT, waitForFedExLogo, ensureRateDemoMerchant };
