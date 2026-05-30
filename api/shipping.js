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
  FEDEX_2_DAY: "FedEx 2nd Day",
  FEDEX_2_DAY_AM: "FedEx 2nd Day AM",
  FEDEX_GROUND: "FedEx Ground",
  GROUND_HOME_DELIVERY: "FedEx Ground Home Delivery",
  PRIORITY_OVERNIGHT: "FedEx Priority Overnight",
  STANDARD_OVERNIGHT: "FedEx Standard Overnight",
  FIRST_OVERNIGHT: "FedEx First Overnight",
};

function formatServiceName(serviceType) {
  return SERVICE_NAMES[serviceType] || serviceType;
}

// ─── Default Shipper Address (Cook Kwee's, Lahaina HI) ────────────────────────
const DEFAULT_ORIGIN = {
  streetLines: ["1 Kahana St"],
  city: "Lahaina",
  stateOrProvinceCode: "HI",
  postalCode: "96761",
  countryCode: "US",
};

// ─── Main Handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Log full incoming request from Ecwid for debugging
    console.log("Incoming request body:", JSON.stringify(req.body, null, 2));

    const { id, cart } = req.body;
    const { shippingAddress, originAddress, weight } = cart;

    // Log parsed values for debugging
    console.log("Parsed values:", JSON.stringify({
      id,
      shippingAddress,
      originAddress,
      weight,
    }, null, 2));

    // Build origin address — fallback to Cook Kwee's default
    const shipperAddress = {
      streetLines: [originAddress?.street || DEFAULT_ORIGIN.streetLines[0]],
      city: originAddress?.city || DEFAULT_ORIGIN.city,
      stateOrProvinceCode:
        originAddress?.stateOrProvinceCode || DEFAULT_ORIGIN.stateOrProvinceCode,
      postalCode: originAddress?.postalCode || DEFAULT_ORIGIN.postalCode,
      countryCode: originAddress?.countryCode || DEFAULT_ORIGIN.countryCode,
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

    // Log the rate request being sent to FedEx
    console.log("FedEx rate request:", JSON.stringify(rateRequest, null, 2));

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

    console.log("Shipping options returned:", JSON.stringify(shippingOptions, null, 2));

    return res.status(200).json({ id, shippingOptions });

  } catch (error) {
    // Log full incoming request from Ecwid
    console.error("Incoming request body:", JSON.stringify(req.body, null, 2));

    // Log full FedEx error including parameterList
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
