const express = require("express");
const router  = express.Router();
const { fetchBrandData, generatePersonality } = require("../services/brand");
const { configureWebhooks } = require("../services/twilio");
const { createClient, getAllClients, getClientById, updateClient, activateClient, suspendClient, getPlatformStats, getAllOrders } = require("../services/db");

function auth(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.status(401).json({ error:"Unauthorized" });
}

router.post("/login",  (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) { req.session.isAdmin=true; res.json({success:true}); }
  else res.status(401).json({ error:"Wrong password" });
});
router.post("/logout", (req, res) => { req.session.destroy(); res.json({success:true}); });

router.get("/stats",   auth, (req, res) => res.json(getPlatformStats()));
router.get("/orders",  auth, (req, res) => res.json(getAllOrders()));
router.get("/clients", auth, (req, res) => res.json(getAllClients()));
router.get("/clients/:id", auth, (req, res) => {
  const c = getClientById(req.params.id);
  if (!c) return res.status(404).json({ error:"Not found" });
  res.json(c);
});

// ── Auto-fetch brand when name is entered ──────
router.post("/fetch-brand", auth, async (req, res) => {
  const { businessName } = req.body;
  if (!businessName) return res.status(400).json({ error:"Business name required" });
  try {
    const brand = await fetchBrandData(businessName);
    const personality = generatePersonality(businessName, brand.businessType);
    res.json({ ...brand, personality });
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

// ── Add client ────────────────────────────────
router.post("/clients", auth, async (req, res) => {
  try {
    const data   = req.body;
    // Auto-generate personality if not customized
    if (!data.personality) {
      data.personality = generatePersonality(data.businessName, data.businessType, data.extraInfo);
    }
    const client = createClient(data);
    res.json({ success:true, client });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// ── Activate (flip the switch after payment) ──
router.post("/clients/:id/activate", auth, async (req, res) => {
  const client = activateClient(req.params.id);
  if (!client) return res.status(404).json({ error:"Not found" });

  // Configure Twilio webhooks on activation
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT||3000}`;
  const wh      = await configureWebhooks(client, baseUrl);
  if (wh.success) updateClient(client.id, { webhooksOk:true });

  req.app.get("io").emit("client_activated", client);
  res.json({ success:true, client, webhooks:wh });
});

router.post("/clients/:id/suspend", auth, (req, res) => {
  const client = suspendClient(req.params.id);
  res.json({ success:true, client });
});

router.patch("/clients/:id", auth, async (req, res) => {
  const updated = updateClient(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error:"Not found" });
  // Re-wire webhooks if credentials changed
  if (req.body.twilioSid || req.body.phone) {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT||3000}`;
    const wh = await configureWebhooks(updated, baseUrl);
    if (wh.success) updateClient(updated.id, { webhooksOk:true });
  }
  res.json({ success:true, client:updated });
});

// ── Re-wire webhooks manually ──────────────────
router.post("/clients/:id/webhooks", auth, async (req, res) => {
  const client  = getClientById(req.params.id);
  if (!client) return res.status(404).json({ error:"Not found" });
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT||3000}`;
  const result  = await configureWebhooks(client, baseUrl);
  if (result.success) updateClient(client.id, { webhooksOk:true });
  res.json(result);
});

module.exports = router;
