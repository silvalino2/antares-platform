const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const { getClientById, getOrdersByClient, updateOrder, verifyPayment, getClientStats } = require("../services/db");

function auth(req, res, next) {
  if (!req.session?.clientId) return res.status(401).json({ error:"Unauthorized" });
  req.client = getClientById(req.session.clientId);
  if (!req.client) return res.status(401).json({ error:"Not found" });
  next();
}

router.post("/login", (req, res) => {
  const { clientId, password } = req.body;
  const client = getClientById(clientId);
  if (!client || client.dashboardPassword !== password) return res.status(401).json({ error:"Invalid credentials" });
  req.session.clientId = client.id;
  const { twilioSid, twilioToken, paystackKey, dashboardPassword, ...safe } = client;
  res.json({ success:true, client:safe });
});

router.post("/logout", (req, res) => { req.session.destroy(); res.json({ success:true }); });
router.get("/me",     auth, (req, res) => { const { twilioSid, twilioToken, paystackKey, dashboardPassword, ...safe } = req.client; res.json(safe); });
router.get("/stats",  auth, (req, res) => res.json(getClientStats(req.session.clientId)));
router.get("/orders", auth, (req, res) => res.json(getOrdersByClient(req.session.clientId)));

router.patch("/orders/:orderId/status", auth, (req, res) => {
  const valid = ["new","confirmed","preparing","ready","delivered","completed"];
  if (!valid.includes(req.body.status)) return res.status(400).json({ error:"Invalid status" });
  const order = updateOrder(req.session.clientId, req.params.orderId, { status:req.body.status });
  if (!order) return res.status(404).json({ error:"Not found" });
  req.app.get("io").emit(`order_updated:${req.session.clientId}`, order);
  res.json(order);
});

router.post("/verify-payment", auth, async (req, res) => {
  const { orderId, paymentRef } = req.body;
  if (!orderId || !paymentRef) return res.status(400).json({ error:"Missing fields" });
  const order = verifyPayment(req.session.clientId, orderId, paymentRef);
  if (!order) return res.status(404).json({ success:false, message:"Order not found" });
  req.app.get("io").emit(`payment_verified:${req.session.clientId}`, order);
  res.json({ success:true, order });
});

module.exports = router;
