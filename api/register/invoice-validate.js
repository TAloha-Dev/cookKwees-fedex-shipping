// api/register/invoice-validate.js
// FedEx Account Registration — Step 2c: Invoice Validation
// Validates a recent FedEx invoice → saves child_key + child_secret to DB

const axios              = require("axios");
const { getTAlohaToken } = require("../../lib/fedex-auth");
const { saveMerchant }   = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { storeId, accountNumber, customerName, accountAuthToken, invoiceDetail } = req.body;

    if (!storeId || !accountNumber || !accountAuthToken || !invoiceDetail) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const token = await getTAlohaToken();

    // Build request body as variable so we can log it
    const requestBody = { invoiceDetail };

    // Log request for validation submission
    console.log("FEDEX_INVOICE_REQUEST:", JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/registration/v2/invoice/keysgeneration`,
      requestBody,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          accountAuthToken,
          "Content-Type": "application/json",
          "x-locale":     "en_US",
        },
      }
    );

    // Log response for validation submission
    console.log("FEDEX_INVOICE_RESPONSE:", JSON.stringify(response.data, null, 2));

    const { child_Key, child_secret } = response.data.output || {};
    if (!child_Key || !child_secret) throw new Error("No credentials received from FedEx.");

    await saveMerchant(storeId, {
      accountNumber,
      customerName,
      childKey:    child_Key,
      childSecret: child_secret,
    });

    console.log(`Merchant ${storeId} connected via Invoice — account ${accountNumber}`);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Invoice validation error:", JSON.stringify(error.response?.data || error.message, null, 2));

    const code    = error.response?.data?.errors?.[0]?.code;
    const message =
      code === "INVOICEDETAILS.DATE.OUTOFRANGE"      ? "Invoice is older than 90 days. Please use a more recent invoice." :
      code === "INVOICEDETAILS.NUMBER.NOTEXIST"      ? "Invoice number not found in FedEx records." :
      code === "INVOICEVALIDATION.MAXRETRY.EXCEEDED" ? "Too many failed attempts. Invoice validation is locked for 24 hours." :
      error.response?.data?.errors?.[0]?.message    || "Invoice validation failed. Please check your details.";

    return res.status(400).json({ error: message });
  }
};
