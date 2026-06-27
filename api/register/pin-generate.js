// api/register/pin-generate.js
// FedEx Account Registration — Step 2a: PIN Generation
// Sends a 6-digit PIN to the merchant via SMS, CALL, or EMAIL.

const axios              = require("axios");
const { getTAlohaToken } = require("../../lib/fedex-auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accountAuthToken, option } = req.body;

    if (!accountAuthToken || !option) {
      return res.status(400).json({ error: "Missing accountAuthToken or option." });
    }

    if (!["SMS", "CALL", "EMAIL"].includes(option)) {
      return res.status(400).json({ error: "Invalid option. Use SMS, CALL, or EMAIL." });
    }

    const token = await getTAlohaToken();

    // Build request body as variable so we can log it
    const requestBody = { locale: "en_US", option };

    // Log request for validation submission
    console.log("FEDEX_PIN_GENERATE_REQUEST:", JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/registration/v2/customerkeys/pingeneration`,
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
    console.log("FEDEX_PIN_GENERATE_RESPONSE:", JSON.stringify(response.data, null, 2));

    const status = response.data?.output?.status;
    console.log(`PIN Generation (${option}): ${status}`);

    return res.status(200).json({
      success: true,
      status: status || "PIN sent",
      method: option,
    });

  } catch (error) {
    console.error("PIN generation error:", JSON.stringify(error.response?.data || error.message, null, 2));

    const code    = error.response?.data?.errors?.[0]?.code;
    const message =
      code === "EMAIL.NOT.REGISTERED"             ? "No email registered for this FedEx account." :
      code === "PHONENUMBER.NOT.REGISTERED"       ? "No phone number registered for this FedEx account." :
      code === "PINGENERATION.MAXRETRY.EXCEEDED"  ? "Too many PIN attempts. Please try invoice verification instead." :
      code === "ACCOUNTAUTHTOKEN.SESSION.EXPIRED" ? "Address Auth Token expired. Please restart registration." :
      error.response?.data?.errors?.[0]?.message  || "Failed to send PIN. Please try again.";

    return res.status(400).json({ error: message });
  }
};
