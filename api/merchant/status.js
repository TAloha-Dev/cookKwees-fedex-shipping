// api/merchant/status.js
// Check if a merchant's FedEx account is connected

const { getMerchant } = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: "Missing storeId." });

    const merchant = await getMerchant(storeId);

    if (!merchant) {
      return res.status(200).json({ connected: false });
    }

    return res.status(200).json({
      connected:     true,
      accountNumber: merchant.accountNumber,
      customerName:  merchant.customerName,
      connectedAt:   merchant.connectedAt,
    });

  } catch (error) {
    console.error("Merchant status error:", error.message);
    return res.status(500).json({ error: "Failed to get merchant status." });
  }
};
