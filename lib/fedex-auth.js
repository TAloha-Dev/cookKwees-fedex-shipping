// lib/fedex-auth.js
// TAloha's FedEx OAuth Token Manager (Phase 2)

const axios = require("axios");

// --- Parent Token (for Account Registration API calls) ---

let tokenCache = { token: null, expiresAt: 0 };

async function getTAlohaToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams();
  params.append("grant_type",    "client_credentials");
  params.append("client_id",     process.env.TALOHA_FEDEX_CLIENT_ID);
  params.append("client_secret", process.env.TALOHA_FEDEX_CLIENT_SECRET);

  const response = await axios.post(
    `${process.env.TALOHA_FEDEX_BASE_URL}/oauth/token`,
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  tokenCache.token     = response.data.access_token;
  tokenCache.expiresAt = now + response.data.expires_in * 1000;
  return tokenCache.token;
}

// --- Merchant CSP Token (for Shipping API calls) ---

const merchantTokenCache = new Map();

async function getMerchantToken(childKey, childSecret) {
  const now    = Date.now();
  const cached = merchantTokenCache.get(childKey);

  if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
    return cached.token;
  }

  const params = new URLSearchParams();
  params.append("grant_type",    "csp_credentials");
  params.append("client_id",     process.env.TALOHA_FEDEX_CLIENT_ID);
  params.append("client_secret", process.env.TALOHA_FEDEX_CLIENT_SECRET);
  params.append("child_Key",     childKey);      // ← Capital K per FedEx
  params.append("child_secret",  childSecret);

  try {
    const response = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/oauth/token`,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    console.log(`[merchant-token] CSP token obtained for child_Key=${childKey.substring(0, 8)}...`);

    merchantTokenCache.set(childKey, {
      token:     response.data.access_token,
      expiresAt: now + response.data.expires_in * 1000,
    });

    return response.data.access_token;
  } catch (error) {
    console.error(
      "[merchant-token] CSP token request failed:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
    throw error;
  }
}

module.exports = { getTAlohaToken, getMerchantToken };
