// api/register/address.js
// FedEx Account Registration — Step 1: Address Validation
// Correct endpoint: POST /registration/v2/address/keysgeneration

const axios              = require("axios");
const { getTAlohaToken, getMerchantToken } = require("../../lib/fedex-auth");
const { saveMerchant }   = require("../../lib/db");

function buildStreetLines(street) {
  if (Array.isArray(street)) {
    return street.map((line) => String(line).trim()).filter(Boolean);
  }
  if (!street) return [];
  // FedEx validation: keep full street on one line (e.g. "HAGAGATAN 1, VI")
  return [String(street).trim()].filter(Boolean);
}

function buildFedExAddress(address) {
  const countryCode = (address.countryCode || "US").toUpperCase();
  const fedexAddress = {
    streetLines: buildStreetLines(address.street),
    city:        address.city,
    postalCode:  address.postalCode,
    countryCode,
    residential: false,
  };

  const state = (address.stateOrProvinceCode || "").trim();
  if (state) fedexAddress.stateOrProvinceCode = state.toUpperCase();

  return fedexAddress;
}

function localeForCountry(countryCode) {
  const locales = { SE: "en_SE", GB: "en_GB", DE: "en_DE", FR: "en_FR" };
  return locales[(countryCode || "").toUpperCase()] || "en_US";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { storeId, accountNumber, customerName, address } = req.body;

    if (!storeId || !accountNumber || !customerName || !address) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const token = await getTAlohaToken();

    // Build request body as variable so we can log it
    const countryCode = (address.countryCode || "US").toUpperCase();
    const requestBody = {
      accountNumber: { value: accountNumber },
      customerName,
      address: buildFedExAddress(address),
    };

    // Log request for validation submission
    console.log("FEDEX_ADDRESS_REQUEST:", JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/registration/v2/address/keysgeneration`,
      requestBody,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-locale":     localeForCountry(countryCode),
        },
      }
    );

    // Log response for validation submission
    console.log("FEDEX_ADDRESS_RESPONSE:", JSON.stringify(response.data, null, 2));

    const output           = response.data.output || {};
    const mfaOptions       = output.mfaOptions || [];
    const accountAuthToken = output.accountAuthToken || mfaOptions[0]?.accountAuthToken;
    const { child_Key, child_secret } = output;

    // Sweden MFA passthrough — child credentials returned directly (skip Factor 2)
    if (child_Key && child_secret) {
      try {
        await saveMerchant(storeId, {
          accountNumber,
          customerName,
          childKey:    child_Key,
          childSecret: child_secret,
        });

        // Log Child Authorization (CSP token) for validation submission
        await getMerchantToken(child_Key, child_secret);
      } catch (setupError) {
        console.error(
          "MFA bypass post-setup error (address validation succeeded):",
          JSON.stringify(setupError.response?.data || setupError.message, null, 2)
        );
      }

      console.log(`Merchant ${storeId} connected via MFA bypass — account ${accountNumber}`);
      return res.status(200).json({ success: true, mfaBypass: true });
    }

    if (!accountAuthToken && mfaOptions.length === 0) {
      throw new Error("No response received from FedEx.");
    }

    return res.status(200).json({
      accountAuthToken,
      mfaOptions,
    });

  } catch (error) {
    console.error(
      "Address validation error:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    const fedexError = error.response?.data?.errors?.[0];
    const code       = fedexError?.code;
    const fedexMsg   = fedexError?.message;
    const message =
      code === "ACCOUNT.ADDRESS.MISMATCH" ? "Address does not match FedEx records. Please check your billing address." :
      code === "ACCOUNT.NUMBER.NOTFOUND"  ? "FedEx account number not found. Please check your account number." :
      fedexMsg || "Address validation failed. Please try again.";

    return res.status(400).json({
      error:     message,
      fedexCode: code || null,
      fedexDetail: error.response?.data || null,
    });
  }
};
