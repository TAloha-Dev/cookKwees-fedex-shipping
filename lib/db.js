// lib/db.js
// Per-merchant credential storage — Upstash Redis (Serverless)
// Persistent across cold starts and shared across all serverless invocations.

const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const KEY = (storeId) => `merchant:${storeId}`;

async function saveMerchant(storeId, data) {
  await redis.set(KEY(storeId), {
    ...data,
    connectedAt: new Date().toISOString(),
  });
}

async function getMerchant(storeId) {
  return (await redis.get(KEY(storeId))) || null;
}

async function deleteMerchant(storeId) {
  await redis.del(KEY(storeId));
}

module.exports = { saveMerchant, getMerchant, deleteMerchant };
