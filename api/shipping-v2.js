// api/shipping-v2.js
// Multi-merchant FedEx shipping endpoint (Phase 2)
// Uses TAloha integrator credentials + per-merchant child credentials from Redis.

const axios                = require("axios");
const { getMerchant }      = require("../lib/db");
const { getMerchantToken } = require("../lib/fedex-auth");

// ─── Config ────────────────────────────────────────────────────────────────────
const ALLOWED_SERVICES = new Set([
  "FEDEX_GROUND",
  "GROUND_HOME_DELIVERY",
  "FEDEX_2_DAY",
  "FEDEX_2_DAY_AM",
  "STANDARD_OVERNIGHT",
  "PRIORITY_OVERNIGHT",
  "FIRST_OVERNIGHT",
]);

const SERVICE_NAMES = {
  FEDEX_GROUND:         "FedEx Ground",
  GROUND_HOME_DELIVERY: "FedEx Home Delivery",
  FEDEX_2_DAY:          "FedEx 2nd Day",
  FEDEX_2_DAY_AM:       "FedEx 2nd Day AM",
  STANDARD_OVERNIGHT:   "FedEx Standard Overnight",
  PRIORITY_OVERNIGHT:   "FedEx Priority Overnight",
  FIRST_OVERNIGHT:      "FedEx First Overnight",
};

function formatServiceName(serviceType) {
  return SERVICE_NAMES[serviceType] || serviceType;
}

// ─── Address Validation ────────────────────────────────────────────────────────
function isCompleteAddress(address) {
  return (
    address?.street &&
    address?.city &&
    address?.postalCode &&
    address?.stateOrProvinceCode &&
    address?.countryCode
  );
}

// ─── Main Handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { storeId } = req.query;
  if (!storeId) {
    console.error("Missing storeId in query params");
    return res.status(200).json({ id: req.body?.id, shippingOptions: [] });
  }

  try {
    const { id, cart } = req.body;
    const { shippingAddress, originAddress, weight } = cart;

    if (!isCompleteAddress(shippingAddress)) {
      console.log(`[${storeId}] Incomplete shipping address — skipping FedEx call`);
      return res.status(200).json({ id, shippingOptions: [] });
    }

    // Look up merchant credentials from Redis
    const merchant = await getMerchant(storeId);
    if (!merchant) {
      console.error(`[${storeId}] Merchant not found in DB`);
      return res.status(200).json({ id, shippingOptions: [] });
    }

    // Get CSP token using merchant's child credentials
    const token = await getMerchantToken(merchant.childKey, merchant.childSecret);

    // Build shipper address from Ecwid origin
    const shipperAddress = {
      streetLines:         [originAddress?.street?.trim() || ""],
      city:                originAddress?.city || "",
      stateOrProvinceCode: originAddress?.stateOrProvinceCode || "",
      postalCode:          originAddress?.postalCode || "",
      countryCode:         originAddress?.countryCode || "US",
    };

    // Build FedEx Comprehensive Rate request
    const rateRequest = {
      accountNumber: { value: merchant.accountNumber },
      requestedShipment: {
        shipper:   { address: shipperAddress },
        recipient: {
          address: {
            streetLines:         [shippingAddress.street],
            city:                shippingAddress.city,
            stateOrProvinceCode: shippingAddress.stateOrProvinceCode,
            postalCode:          shippingAddress.postalCode,
            countryCode:         shippingAddress.countryCode || "US",
            residential:         true,
          },
        },
        requestedPackageLineItems: [
          {
            weight: { units: "LB", value: weight || 1 },
          },
        ],
        pickupType:      "USE_SCHEDULED_PICKUP",
        rateRequestType: ["ACCOUNT"],
      },
    };

    // Call FedEx Comprehensive Rates API (per FedEx Validation Team guidance)
    const rateResponse = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/rate/v1/comprehensiverates/quotes`,
      rateRequest,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale":     "en_US",
        },
      }
    );

    // Parse and filter rate results
    const shippingOptions = [];
    const rateDetails = rateResponse.data.output?.rateReplyDetails || [];

    for (const detail of rateDetails) {
      if (!ALLOWED_SERVICES.has(detail.serviceType)) continue;

      const ratedShipment = detail.ratedShipmentDetails?.[0];
      if (!ratedShipment) continue;

      shippingOptions.push({
        title:           formatServiceName(detail.serviceType),
        fulfillmentType: "shipping",
        rate:            parseFloat(ratedShipment.totalNetCharge),
        transitDays:     detail.commit?.transitDays || null,
      });
    }

    console.log(`[${storeId}] Comprehensive Rates returned ${shippingOptions.length} options`);
    return res.status(200).json({ id, shippingOptions });

  } catch (error) {
    console.error(
      `[${storeId}] FedEx API error:`,
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
    return res.status(200).json({
      id: req.body?.id,
      shippingOptions: [],
    });
  }
};
