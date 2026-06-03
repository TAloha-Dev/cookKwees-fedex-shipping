// lib/fedex-auth.js
// TAloha's FedEx OAuth Token Manager (Phase 2)
// Two token types:
//   1. getTAlohaToken()    — Parent/integrator token (for Account Registration API calls)
//   2. getMerchantToken()  — CSP token (for shipping API calls on behalf of a merchant)

const axios = require("axios");

// --- Parent Token (existing, unchanged) ---

let tokenCache = { token: null, expiresAt: 0 };

async function getTAlohaToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", process.env.TALOHA_FEDEX_CLIENT_ID);
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

// --- Merchant CSP Token (new — uses parent + child credentials) ---

const merchantTokenCache = new Map();

/**
 * Get an OAuth token for a specific merchant using CSP credentials.
 * Combines TAloha's parent client_id/client_secret with the merchant's
 * child_key/child_secret (obtained via Account Registration API).
 *
 * @param {string} childKey    - Merchant's child_key from registration
 * @param {string} childSecret - Merchant's child_secret from registration
 * @returns {Promise<string>}  - OAuth access token for merchant API calls
 */
async function getMerchantToken(childKey, childSecret) {
  const now    = Date.now();
  const cached = merchantTokenCache.get(childKey);

  // Return cached token if still valid (with 5-min buffer)
  if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
    return cached.token;
  }

  const params = new URLSearchParams();
  params.append("grant_type",    "csp_credentials");
  params.append("client_id",     process.env.TALOHA_FEDEX_CLIENT_ID);
  params.append("client_secret", process.env.TALOHA_FEDEX_CLIENT_SECRET);
  params.append("child_key",     childKey);
  params.append("child_secret",  childSecret);

  const response = await axios.post(
    `${process.env.TALOHA_FEDEX_BASE_URL}/oauth/token`,
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  merchantTokenCache.set(childKey, {
    token:     response.data.access_token,
    expiresAt: now + response.data.expires_in * 1000,
  });

  return response.data.access_token;
}

module.exports = { getTAlohaToken, getMerchantToken };
