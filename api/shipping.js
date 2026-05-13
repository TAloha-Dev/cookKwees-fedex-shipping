// api/shipping.js
// Cook Kwee's — FedEx REST API Middleware

const axios = require('axios');

let tokenCache = { token: null, expiresAt: 0 };

async function getFedExToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.token;
  }
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.FEDEX_CLIENT_ID);
  params.append('client_secret', process.env.FEDEX_CLIENT_SECRET);
  const response = await axios.post(
    `${process.env.FEDEX_BASE_URL}/oauth/token`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  tokenCache.token = response.data.access_token;
  tokenCache.expiresAt = now + response.data.expires_in * 1000;
  return tokenCache.token;
}

function formatServiceName(serviceType) {
  const names = {
    'FEDEX_2_DAY':        'FedEx 2nd Day',
    'FEDEX_2_DAY_AM':     'FedEx 2nd Day AM',
    'FEDEX_GROUND':       'FedEx Ground',
    'PRIORITY_OVERNIGHT': 'FedEx Priority Overnight',
    'STANDARD_OVERNIGHT': 'FedEx Standard Overnight',
    'FIRST_OVERNIGHT':    'FedEx First Overnight'
  };
  return names[serviceType] || serviceType;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { id, cart } = req.body;
    const { shippingAddress, originAddress, weight } = cart;
    const token = await getFedExToken();
    const rateRequest = {
      accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
      requestedShipment: {
        shipper: {
          address: {
            streetLines: [originAddress?.street || '1 Kahana St'],
            city: originAddress?.city || 'Lahaina',
            stateOrProvinceCode: originAddress?.stateOrProvinceCode || 'HI',
            postalCode: originAddress?.postalCode || '96761',
            countryCode: originAddress?.countryCode || 'US'
          }
        },
        recipient: {
          address: {
            streetLines: [shippingAddress.street],
            city: shippingAddress.city,
            stateOrProvinceCode: shippingAddress.stateOrProvinceCode,
            postalCode: shippingAddress.postalCode,
            countryCode: shippingAddress.countryCode || 'US',
            residential: true
          }
        },
        requestedPackageLineItems: [{
          weight: { units: 'LB', value: weight || 1 }
        }],
        pickupType: 'USE_SCHEDULED_PICKUP',
        rateRequestType: ['ACCOUNT']
      }
    };
    const rateResponse = await axios.post(
      `${process.env.FEDEX_BASE_URL}/rate/v1/rates/quotes`,
      rateRequest,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        }
      }
    );
    const shippingOptions = [];
    const rateDetails = rateResponse.data.output?.rateReplyDetails || [];
    for (const detail of rateDetails) {
      const ratedShipment = detail.ratedShipmentDetails?.[0];
      if (!ratedShipment) continue;
      shippingOptions.push({
        title: formatServiceName(detail.serviceType),
        fulfillmentType: 'shipping',
        rate: parseFloat(ratedShipment.totalNetCharge),
        transitDays: detail.commit?.transitDays || 2
      });
    }
    return res.status(200).json({ id, shippingOptions });
  } catch (error) {
    console.error('FedEx API error:', error.response?.data || error.message);
    return res.status(200).json({ id: req.body?.id, shippingOptions: [] });
  }
};
