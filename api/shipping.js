// api/shipping.js
// Cook Kwee's Maui Cookies — FedEx REST API Middleware
// Updated: May 30, 2026

const axios = require("axios");

// ─── Token Cache ───────────────────────────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getFedExToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", process.env.FEDEX_CLIENT_ID);
  params.append("client_secret", process.env.FEDEX_CLIENT_SECRET);

  const response = await axios.post(
    `${process.env.FEDEX_BASE_URL}/oauth/token`,
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  tokenCache.token = response.data.access_token;
  tokenCache.expiresAt = now + response.data.expires_in * 1000;
  return tokenCache.token;
}

// ─── Config ────────────────────────────────────────────────────────────────────
// Phase 1: FedEx 2nd Day only.
// To add more services later, add to this Set.
const ALLOWED_SERVICES = new Set(["FEDEX_2_DAY"]);

const SERVICE_NAMES = {
  FEDEX_2_DAY:           "FedEx 2nd Day",
  FEDEX_2_DAY_AM:        "FedEx 2nd Day AM",
  FEDEX_GROUND:          "FedEx Ground",
  GROUND_HOME_DELIVERY:  "FedEx Ground Home Delivery",
  PRIORITY_OVERNIGHT:    "FedEx Priority Overnight",
  STANDARD_OVERNIGHT:    "FedEx Standard Overnight",
  FIRST_OVERNIGHT:       "FedEx First Overnight",
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

  try {
    const { id, cart } = req.body;
    const { shippingAddress, originAddress, weight } = cart;

    // Skip FedEx call if address is incomplete (Ecwid calls this
    // endpoint multiple times as the customer types their address)
    if (!isCompleteAddress(shippingAddress)) {
      console.log("Incomplete shipping address — skipping FedEx call");
      return res.status(200).json({ id, shippingOptions: [] });
    }

    // Build shipper address from Ecwid origin (Cook Kwee's actual address)
    const shipperAddress = {
      streetLines: [originAddress?.street?.trim() || "251 Lalo Street, Suite K1"],
      city: originAddress?.city || "Kahului",
      stateOrProvinceCode: originAddress?.stateOrProvinceCode || "HI",
      postalCode: originAddress?.postalCode || "96732",
      countryCode: originAddress?.countryCode || "US",
    };

    // Get FedEx OAuth token
    const token = await getFedExToken();

    // Build FedEx rate request
    const rateRequest = {
      accountNumber: {
        value: process.env.FEDEX_ACCOUNT_NUMBER,
      },
      requestedShipment: {
        shipper: { address: shipperAddress },
        recipient: {
          address: {
            streetLines: [shippingAddress.street],
            city: shippingAddress.city,
            stateOrProvinceCode: shippingAddress.stateOrProvinceCode,
            postalCode: shippingAddress.postalCode,
            countryCode: shippingAddress.countryCode || "US",
            residential: true,
          },
        },
        requestedPackageLineItems: [
          {
            weight: {
              units: "LB",
              value: weight || 1,
            },
          },
        ],
        pickupType: "USE_SCHEDULED_PICKUP",
        rateRequestType: ["ACCOUNT"],
        shippingChargesPayment: {
          paymentType: "SENDER",
          payor: {
            responsibleParty: {
              accountNumber: {
                value: process.env.FEDEX_ACCOUNT_NUMBER,
              },
            },
          },
        },
      },
    };

    // Call FedEx Rates and Transit Times API
    const rateResponse = await axios.post(
      `${process.env.FEDEX_BASE_URL}/rate/v1/rates/quotes`,
      rateRequest,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US",
        },
      }
    );

    // Parse and filter rate results — Phase 1: FEDEX_2_DAY only
    const shippingOptions = [];
    const rateDetails = rateResponse.data.output?.rateReplyDetails || [];

    for (const detail of rateDetails) {
      if (!ALLOWED_SERVICES.has(detail.serviceType)) continue;

      const ratedShipment = detail.ratedShipmentDetails?.[0];
      if (!ratedShipment) continue;

      shippingOptions.push({
        title: formatServiceName(detail.serviceType),
        fulfillmentType: "shipping",
        rate: parseFloat(ratedShipment.totalNetCharge),
        transitDays: detail.commit?.transitDays || 2,
      });
    }

    console.log("Shipping options returned:", JSON.stringify(shippingOptions));
    return res.status(200).json({ id, shippingOptions });

  } catch (error) {
    console.error(
      "FedEx API error:",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
    return res.status(200).json({
      id: req.body?.id,
      shippingOptions: [],
    });
  }
};
