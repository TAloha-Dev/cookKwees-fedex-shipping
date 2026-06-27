// api/register/address.js
// FedEx Account Registration — Step 1: Address Validation
// Correct endpoint: POST /registration/v2/address/keysgeneration

const axios              = require("axios");
const { getTAlohaToken } = require("../../lib/fedex-auth");

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
    const requestBody = {
      accountNumber: { value: accountNumber },
      customerName,
      address: {
        streetLines:         [address.street],
        city:                address.city,
        stateOrProvinceCode: address.stateOrProvinceCode,
        postalCode:          address.postalCode,
        countryCode:         address.countryCode || "US",
        residential:         false,
      },
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
          "x-locale":     "en_US",
        },
      }
    );

    // Log response for validation submission
    console.log("FEDEX_ADDRESS_RESPONSE:", JSON.stringify(response.data, null, 2));

    const output           = response.data.output;
    const accountAuthToken = output?.accountAuthToken;
    const mfaOptions       = output?.mfaOptions || [];

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

    const code    = error.response?.data?.errors?.[0]?.code;
    const message =
      code === "ACCOUNT.ADDRESS.MISMATCH"  ? "Address does not match FedEx records. Please check your billing address." :
      code === "ACCOUNT.NUMBER.NOTFOUND"   ? "FedEx account number not found. Please check your account number." :
      error.response?.data?.errors?.[0]?.message || "Address validation failed. Please try again.";

    return res.status(400).json({ error: message });
  }
};
