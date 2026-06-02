// lib/db.js
// Database abstraction layer — Per-merchant credential storage
// ⚠️ Currently using in-memory store (for development/testing only)
// TODO: Replace with Vercel KV, Supabase, or MongoDB Atlas for production

const store = new Map();

async function saveMerchant(storeId, data) {
  store.set(String(storeId), {
    ...data,
    connectedAt: new Date().toISOString(),
  });
}

async function getMerchant(storeId) {
  return store.get(String(storeId)) || null;
}

async function deleteMerchant(storeId) {
  store.delete(String(storeId));
}

module.exports = { saveMerchant, getMerchant, deleteMerchant };
