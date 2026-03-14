const twilio = require("twilio");

async function configureWebhooks(client, baseUrl) {
  if (!client.twilioSid || !client.twilioToken || !client.phone) return { success:false, error:"Missing credentials" };
  try {
    const tw  = twilio(client.twilioSid, client.twilioToken);
    const base = baseUrl.replace(/\/$/,"");
    const nums = await tw.incomingPhoneNumbers.list({ phoneNumber: client.phone });
    if (!nums.length) return { success:false, error:`${client.phone} not found in this Twilio account` };
    await tw.incomingPhoneNumbers(nums[0].sid).update({
      voiceUrl:             `${base}/twilio/voice/${client.id}`,
      voiceMethod:          "POST",
      statusCallback:       `${base}/twilio/status/${client.id}`,
      statusCallbackMethod: "POST",
      smsUrl:               `${base}/twilio/sms/${client.id}`,
      smsMethod:            "POST",
    });
    return { success:true };
  } catch(err) { return { success:false, error:err.message }; }
}

async function sendSMS(client, to, body) {
  try {
    const tw = twilio(client.twilioSid, client.twilioToken);
    await tw.messages.create({ from:client.phone, to, body });
    return true;
  } catch(e) { console.error("SMS error:",e.message); return false; }
}

async function sendWhatsApp(client, to, body) {
  try {
    const tw = twilio(client.twilioSid, client.twilioToken);
    await tw.messages.create({ from:client.whatsappNumber||`whatsapp:${client.phone}`, to, body });
    return true;
  } catch(e) { console.error("WhatsApp error:",e.message); return false; }
}

module.exports = { configureWebhooks, sendSMS, sendWhatsApp };
