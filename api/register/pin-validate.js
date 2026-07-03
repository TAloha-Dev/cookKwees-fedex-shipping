// api/register/pin-validate.js
// FedEx Account Registration — Step 2b: PIN Validation
// Validates the 6-digit PIN → saves child_key + child_secret to DB

const axios              = require("axios");
const { getTAlohaToken, getMerchantToken } = require("../../lib/fedex-auth");
const { saveMerchant }   = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { storeId, accountNumber, customerName, accountAuthToken, secureCodePin } = req.body;

    if (!storeId || !accountNumber || !accountAuthToken || !secureCodePin) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const token = await getTAlohaToken();

    // Build request body as variable so we can log it
    const requestBody = { secureCodePin };

    // Log request for validation submission
    console.log("FEDEX_PIN_VALIDATE_REQUEST:", JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/registration/v2/pin/keysgeneration`,
      requestBody,
      {
        headers: {
          Authorization:    `Bearer ${token}`,
          accountAuthToken,
          "Content-Type":   "application/json",
          "x-locale":       "en_US",
        },
      }
    );

    // Log response for validation submission
    console.log("FEDEX_PIN_VALIDATE_RESPONSE:", JSON.stringify(response.data, null, 2));

    const { child_Key, child_secret } = response.data.output || {};
    if (!child_Key || !child_secret) throw new Error("No credentials received from FedEx.");

    await saveMerchant(storeId, {
      accountNumber,
      customerName,
      childKey:    child_Key,
      childSecret: child_secret,
    });

    // Log Child Authorization (CSP token) for validation submission
    await getMerchantToken(child_Key, child_secret);

    console.log(`Merchant ${storeId} connected via PIN — account ${accountNumber}`);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("PIN validation error:", JSON.stringify(error.response?.data || error.message, null, 2));

    const code    = error.response?.data?.errors?.[0]?.code;
    const message =
      code === "PIN.PINSECURECODE.INVALIDEXPIRED"  ? "PIN has expired. Please request a new PIN." :
      code === "PINVALIDATION.MAXRETRY.EXCEEDED"   ? "Too many failed attempts. PIN is locked for 24 hours." :
      code === "PIN.PINSECURECODE.REQUIRED"        ? "Please enter a valid PIN." :
      error.response?.data?.errors?.[0]?.message  || "PIN validation failed. Please try again.";

    return res.status(400).json({ error: message });
  }
};
