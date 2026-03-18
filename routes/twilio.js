const express  = require("express");
const router   = express.Router();
const twilio   = require("twilio");
const { chat } = require("../services/ai");
const { getClientById } = require("../services/db");
const { sendWhatsApp, sendSMS } = require("../services/twilio");

const VoiceResponse     = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

router.post("/voice/:clientId", async (req, res) => {
  const client = getClientById(req.params.clientId);
  const twiml  = new VoiceResponse();
  if (!client || !client.active) {
    twiml.say({ voice:"Polly.Joanna" }, "This service is currently unavailable.");
    res.type("text/xml"); return res.send(twiml.toString());
  }
  // Emit live call started event
  req.app.get("io").emit(`call_started:${client.id}`, { from: req.body.From, clientId: client.id, businessName: client.businessName, time: new Date().toISOString() });
  req.app.get("io").emit("call_started", { from: req.body.From, clientId: client.id, businessName: client.businessName, time: new Date().toISOString() });
  const gather = twiml.gather({ input:"speech", action:`/twilio/voice-respond/${client.id}`, method:"POST", speechTimeout:"auto", language:"en-NG" });
  gather.say({ voice:"Polly.Joanna" }, `Welcome to ${client.businessName}. How may I help you today?`);
  twiml.say({ voice:"Polly.Joanna" }, "I didn't catch that. Please call back and speak after the greeting. Goodbye.");
  res.type("text/xml"); res.send(twiml.toString());
});

// Filler phrases — played while OpenAI is processing
const FILLERS = [
  "I'm with you...",
  "One moment please...",
  "Let me check that for you...",
  "Sure, give me just a second...",
  "I can hear you, one moment...",
  "Right away...",
];
function getFiller() { return FILLERS[Math.floor(Math.random() * FILLERS.length)]; }

router.post("/voice-respond/:clientId", async (req, res) => {
  const client  = getClientById(req.params.clientId);
  const speech  = req.body.SpeechResult;
  const phone   = req.body.From;
  const twiml   = new VoiceResponse();
  if (!speech) {
    const g = twiml.gather({ input:"speech", action:`/twilio/voice-respond/${client.id}`, method:"POST", speechTimeout:"auto" });
    g.say({ voice:"Polly.Joanna" }, "Sorry, I didn't hear that. Could you please repeat?");
    res.type("text/xml"); return res.send(twiml.toString());
  }

  // Play filler phrase immediately while OpenAI processes
  twiml.say({ voice:"Polly.Joanna" }, getFiller());

  try {
    const { reply, order, paymentTriggered } = await chat(client.id, phone, speech, "call");
    if (order) req.app.get("io").emit(`new_order:${client.id}`, order);

    // Fire payment SMS if AI triggered it
    if (paymentTriggered && client.bankAccount) {
      const smsBody = [
        `${client.businessName} — Payment Details`,
        ``,
        `Bank:    ${client.bankName}`,
        `Account: ${client.bankAccount}`,
        `Name:    ${client.bankAccountName}`,
        ``,
        `Once you have transferred, send your proof of payment on WhatsApp to confirm your order and we will process it immediately.`,
      ].join("\n");
      sendSMS(client, phone, smsBody).catch(e => console.error("Payment SMS error:", e.message));
    }

    const g = twiml.gather({ input:"speech", action:`/twilio/voice-respond/${client.id}`, method:"POST", speechTimeout:"auto" });
    g.say({ voice:"Polly.Joanna" }, reply);
  } catch(e) { twiml.say({ voice:"Polly.Joanna" }, "I'm having a brief issue. Please hold."); }
  res.type("text/xml"); res.send(twiml.toString());
});

router.post("/status/:clientId", (req, res) => {
  const status = req.body.CallStatus;
  const client = getClientById(req.params.clientId);
  if (client && (status === "completed" || status === "no-answer" || status === "busy" || status === "failed")) {
    req.app.get("io").emit(`call_ended:${client.id}`, { clientId: client.id, status, duration: req.body.CallDuration || 0 });
    req.app.get("io").emit("call_ended", { clientId: client.id, businessName: client.businessName, status, duration: req.body.CallDuration || 0 });
  }
  res.sendStatus(200);
});

router.post("/sms/:clientId", async (req, res) => {
  const client = getClientById(req.params.clientId);
  const twiml  = new MessagingResponse();
  if (!client || !client.active) { twiml.message("Service unavailable."); res.type("text/xml"); return res.send(twiml.toString()); }
  try {
    const { reply, order } = await chat(client.id, req.body.From, req.body.Body?.trim(), "sms");
    if (order) req.app.get("io").emit(`new_order:${client.id}`, order);
    twiml.message(reply);
  } catch(e) { twiml.message("Something went wrong. Please try again."); }
  res.type("text/xml"); res.send(twiml.toString());
});

router.post("/whatsapp/:clientId", async (req, res) => {
  const client = getClientById(req.params.clientId);
  if (!client || !client.active) return res.sendStatus(200);
  try {
    const { reply, order } = await chat(client.id, req.body.From, req.body.Body?.trim(), "whatsapp");
    if (order) req.app.get("io").emit(`new_order:${client.id}`, order);
    await sendWhatsApp(client, req.body.From, reply);
  } catch(e) { console.error("WA error:", e); }
  res.sendStatus(200);
});

module.exports = router;
