// DB — JSON flat file (Railway-safe)
const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
// Railway persistent volume mounts at /data — use it if available
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "..");
const DB_PATH  = path.join(DATA_DIR, "db.json");

function load() {
  try { if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH,"utf8")); } catch(e){}
  return { clients: {}, orders: {}, sessions: {} };
}
function save(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); }

// ── CLIENTS ───────────────────────────────────
function createClient(data) {
  const db = load();
  const id = uuidv4();
  const client = {
    id,
    // Business identity
    businessName:    data.businessName,
    businessType:    data.businessType,
    ownerName:       data.ownerName || "",
    email:           data.email || "",
    // Brand (auto-fetched)
    logoUrl:         data.logoUrl || "",
    colors:          data.colors || {},
    // Comms
    publicPhone:     data.publicPhone || data.phone, // MTN/Airtel number customers actually call
    phone:           data.phone,                     // Twilio number (hidden — receives forwarded calls)
    forwardingCode:  data.publicPhone ? `*21*${data.phone}#` : null, // MTN code to activate forwarding
    whatsappNumber:  data.whatsappNumber || "",
    twilioSid:       data.twilioSid,
    twilioToken:     data.twilioToken,
    // AI
    personality:     data.personality || "",
    menuOrServices:  data.menuOrServices || [],
    extraInfo:       data.extraInfo || "",
    // Payments
    paystackKey:     data.paystackKey || "",
    bankName:        data.bankName || "",
    bankAccount:     data.bankAccount || "",
    bankAccountName: data.bankAccountName || "",
    // Platform
    dashboardPassword: data.dashboardPassword,
    status:          "pending",   // pending | active | suspended
    active:          false,       // Victor flips this to true after payment
    webhooksOk:      false,
    createdAt:       new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
  };
  db.clients[id] = client;
  save(db);
  return client;
}

function getAllClients() {
  return Object.values(load().clients).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
function getClientById(id)       { return load().clients[id] || null; }
function getClientByPhone(phone) { return Object.values(load().clients).find(c=>c.phone===phone||c.whatsappNumber===phone)||null; }

function updateClient(id, updates) {
  const db = load();
  if (!db.clients[id]) return null;
  db.clients[id] = { ...db.clients[id], ...updates, updatedAt: new Date().toISOString() };
  save(db);
  return db.clients[id];
}

function activateClient(id) {
  return updateClient(id, { active: true, status: "active" });
}
function suspendClient(id) {
  return updateClient(id, { active: false, status: "suspended" });
}

// ── ORDERS ────────────────────────────────────
function createOrder(clientId, data) {
  const db     = load();
  const client = db.clients[clientId];
  const count  = Object.values(db.orders).filter(o=>o.clientId===clientId).length;
  const order  = {
    id:           `ORD-${String(count+1).padStart(3,"0")}`,
    clientId,
    businessName: client?.businessName || "",
    customer:     data.customer || "Guest",
    phone:        data.phone,
    channel:      data.channel,
    items:        data.items || [],
    total:        data.total || 0,
    status:       "new",
    paymentStatus:"pending",
    paymentRef:   null,
    notes:        data.notes || "",
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  db.orders[`${clientId}:${order.id}`] = order;
  save(db);
  return order;
}

function getOrdersByClient(clientId) {
  return Object.values(load().orders).filter(o=>o.clientId===clientId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
function getAllOrders() {
  return Object.values(load().orders).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
function getOrderById(clientId, orderId) { return load().orders[`${clientId}:${orderId}`]||null; }
function updateOrder(clientId, orderId, updates) {
  const db  = load();
  const key = `${clientId}:${orderId}`;
  if (!db.orders[key]) return null;
  db.orders[key] = { ...db.orders[key], ...updates, updatedAt: new Date().toISOString() };
  save(db);
  return db.orders[key];
}
function verifyPayment(clientId, orderId, ref) {
  return updateOrder(clientId, orderId, { paymentStatus:"verified", paymentRef:ref, status:"confirmed" });
}

// ── SESSIONS ──────────────────────────────────
function getSession(clientId, phone) {
  const db  = load();
  const key = `${clientId}:${phone}`;
  if (!db.sessions[key]) { db.sessions[key] = { clientId, phone, history:[], lastActive:new Date().toISOString() }; save(db); }
  return db.sessions[key];
}
function saveSession(clientId, phone, updates) {
  const db  = load();
  const key = `${clientId}:${phone}`;
  db.sessions[key] = { ...db.sessions[key], ...updates, lastActive: new Date().toISOString() };
  save(db);
}

// ── STATS ─────────────────────────────────────
function getClientStats(clientId) {
  const orders = getOrdersByClient(clientId);
  const today  = new Date(); today.setHours(0,0,0,0);
  const td     = orders.filter(o=>new Date(o.createdAt)>=today);
  return {
    totalToday:    td.length,
    totalAllTime:  orders.length,
    pending:       orders.filter(o=>["new","confirmed","preparing"].includes(o.status)).length,
    verified:      orders.filter(o=>o.paymentStatus==="verified").length,
    todayRevenue:  td.filter(o=>o.paymentStatus==="verified").reduce((s,o)=>s+o.total,0),
    totalRevenue:  orders.filter(o=>o.paymentStatus==="verified").reduce((s,o)=>s+o.total,0),
    calls:         td.filter(o=>o.channel==="call").length,
    sms:           td.filter(o=>o.channel==="sms").length,
    wa:            td.filter(o=>o.channel==="whatsapp").length,
  };
}

function getPlatformStats() {
  const clients = getAllClients();
  const orders  = getAllOrders();
  return {
    total:    clients.length,
    active:   clients.filter(c=>c.active).length,
    pending:  clients.filter(c=>c.status==="pending").length,
    orders:   orders.length,
    todayOrders: orders.filter(o=>{ const t=new Date();t.setHours(0,0,0,0);return new Date(o.createdAt)>=t; }).length,
    revenue:  orders.filter(o=>o.paymentStatus==="verified").reduce((s,o)=>s+o.total,0),
  };
}

module.exports = {
  createClient, getAllClients, getClientById, getClientByPhone, updateClient, activateClient, suspendClient,
  createOrder, getOrdersByClient, getAllOrders, getOrderById, updateOrder, verifyPayment,
  getSession, saveSession,
  getClientStats, getPlatformStats,
};
