// api/register/address.js
// FedEx Account Registration — Step 1: Address Validation
// Validates merchant's FedEx account number + billing address
// Returns accountAuthToken (valid 30 minutes) for next step

const axios          = require("axios");
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

    const response = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/csp/v1/account`,
      {
        accountNumber:  { value: accountNumber },
        customerName,
        address: {
          streetLines:          [address.street],
          city:                 address.city,
          stateOrProvinceCode:  address.stateOrProvinceCode,
          postalCode:           address.postalCode,
          countryCode:          address.countryCode || "US",
        },
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-locale":     "en_US",
        },
      }
    );

    const accountAuthToken = response.data.output?.accountAuthToken;
    if (!accountAuthToken) throw new Error("No accountAuthToken received.");

    return res.status(200).json({ accountAuthToken });

  } catch (error) {
    console.error("Address validation error:", JSON.stringify(error.response?.data || error.message, null, 2));

    const code    = error.response?.data?.errors?.[0]?.code;
    const message =
      code === "ACCOUNT.ADDRESS.MISMATCH"  ? "Address does not match FedEx records. Please check your billing address." :
      code === "ACCOUNT.NUMBER.NOTFOUND"   ? "FedEx account number not found. Please check your account number." :
      error.response?.data?.errors?.[0]?.message || "Address validation failed. Please try again.";

    return res.status(400).json({ error: message });
  }
};
