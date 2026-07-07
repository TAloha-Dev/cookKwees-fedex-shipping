// api/rates-demo.js
// Validation demo: live comprehensive rates matching RATE_API JSON scenario.

const axios = require("axios");
const { getMerchant } = require("../lib/db");
const { getMerchantToken } = require("../lib/fedex-auth");

const DEMO_CART = {
  originAddress: {
    street: "15 W 18TH ST FL 7",
    city: "NEW YORK",
    stateOrProvinceCode: "NY",
    postalCode: "10011",
    countryCode: "US",
  },
  shippingAddress: {
    street: "123 Main St",
    city: "Atlanta",
    stateOrProvinceCode: "GA",
    postalCode: "30301",
    countryCode: "US",
  },
  weight: 5,
};

const SERVICE_NAMES = {
  FEDEX_GROUND: "FedEx Ground®",
  GROUND_HOME_DELIVERY: "FedEx Home Delivery®",
  FEDEX_2_DAY: "FedEx 2Day®",
  FEDEX_2_DAY_AM: "FedEx 2Day® A.M.",
  STANDARD_OVERNIGHT: "FedEx Standard Overnight®",
  PRIORITY_OVERNIGHT: "FedEx Priority Overnight®",
  FIRST_OVERNIGHT: "FedEx First Overnight®",
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const storeId = req.query.storeId;
  if (!storeId) {
    return res.status(400).json({ error: "Missing storeId query parameter" });
  }

  try {
    const merchant = await getMerchant(storeId);
    if (!merchant?.childKey || !merchant?.childSecret) {
      return res.status(404).json({ error: "Merchant not registered for this storeId" });
    }

    const token = await getMerchantToken(merchant.childKey, merchant.childSecret);
    const { originAddress, shippingAddress, weight } = DEMO_CART;

    const rateRequest = {
      accountNumber: { value: merchant.accountNumber },
      requestedShipment: {
        shipper: { address: {
          streetLines: [originAddress.street],
          city: originAddress.city,
          stateOrProvinceCode: originAddress.stateOrProvinceCode,
          postalCode: originAddress.postalCode,
          countryCode: originAddress.countryCode,
        }},
        recipient: { address: {
          streetLines: [shippingAddress.street],
          city: shippingAddress.city,
          stateOrProvinceCode: shippingAddress.stateOrProvinceCode,
          postalCode: shippingAddress.postalCode,
          countryCode: shippingAddress.countryCode,
          residential: true,
        }},
        requestedPackageLineItems: [{ weight: { units: "LB", value: weight } }],
        pickupType: "USE_SCHEDULED_PICKUP",
        rateRequestType: ["ACCOUNT"],
      },
    };

    const rateResponse = await axios.post(
      `${process.env.TALOHA_FEDEX_BASE_URL}/rate/v1/comprehensiverates/quotes`,
      rateRequest,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-locale": "en_US",
        },
      }
    );

    const options = (rateResponse.data.output?.rateReplyDetails || []).map((detail) => {
      const charge = detail.ratedShipmentDetails?.[0]?.totalNetCharge;
      return {
        serviceType: detail.serviceType,
        title: SERVICE_NAMES[detail.serviceType] || detail.serviceName || detail.serviceType,
        rate: charge != null ? parseFloat(charge) : null,
      };
    }).filter((o) => o.rate != null);

    return res.status(200).json({ shippingOptions: options, storeId });
  } catch (error) {
    console.error("rates-demo error:", JSON.stringify(error.response?.data || error.message, null, 2));
    return res.status(500).json({
      error: "Failed to fetch rates",
      fedexDetail: error.response?.data || null,
    });
  }
};
