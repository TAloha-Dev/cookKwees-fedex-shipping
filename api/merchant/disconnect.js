// api/merchant/disconnect.js
// Disconnect a merchant's FedEx account — removes credentials from DB

const { deleteMerchant } = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { storeId } = req.body;
    if (!storeId) return res.status(400).json({ error: "Missing storeId." });

    await deleteMerchant(storeId);

    console.log(`Merchant ${storeId} disconnected.`);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Disconnect error:", error.message);
    return res.status(500).json({ error: "Failed to disconnect account." });
  }
};
