// AI Brain — per-client personality
const OpenAI = require("openai");
const { getClientById, getSession, saveSession, createOrder } = require("./db");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(clientId, phone, userMessage, channel="sms") {
  const client = getClientById(clientId);
  if (!client) return { reply:"This service is currently unavailable.", order:null };

  const session = getSession(clientId, phone);
  const history = session.history || [];
  history.push({ role:"user", content:userMessage });
  if (history.length > 24) history.splice(0, history.length-24);

  // Build menu/services context
  let servicesText = "";
  if (client.menuOrServices && client.menuOrServices.length > 0) {
    servicesText = "\n\nAVAILABLE " + (client.businessType==="restaurant" ? "MENU" : "SERVICES/PRODUCTS") + ":\n";
    const cats = [...new Set(client.menuOrServices.map(i=>i.category))];
    for (const cat of cats) {
      servicesText += `\n${cat.toUpperCase()}\n`;
      client.menuOrServices.filter(i=>i.category===cat).forEach(i=>{
        servicesText += `  • ${i.name}${i.price ? ` — ₦${Number(i.price).toLocaleString()}` : ""}${i.description ? ` (${i.description})` : ""}\n`;
      });
    }
  }

  // Payment info
  const payInfo = [
    client.bankAccount ? `Bank Transfer: ${client.bankAccountName}, ${client.bankName}, Acc: ${client.bankAccount}` : "",
    client.paystackKey ? `Online payment available — customer should use their Order ID as reference` : "",
  ].filter(Boolean).join("\n");

  const waNumber = (client.whatsappNumber || client.publicPhone || client.phone || "").replace("whatsapp:","");

  const voicePayInstruction = channel === "call" && client.bankAccount
    ? `IMPORTANT FOR CALLS: When the customer is ready to pay, DO NOT read out the account number.
Instead say exactly: "I will send the payment details to your phone right now via SMS. Once you have transferred, please send your proof of payment on WhatsApp to confirm your order and we will process it immediately."
Then append <SEND_PAYMENT_SMS/> at the end of your reply so the system sends the SMS.`
    : "";

  const systemPrompt = `${client.personality}

${servicesText}

${payInfo ? `PAYMENT INSTRUCTIONS:\n${payInfo}` : ""}

${voicePayInstruction}

RULES:
- Only offer items/services listed above
- Always confirm before finalizing
- SMS/WhatsApp: keep replies short. Calls: be conversational
- Ask for the customer's name early in the conversation
- Never invent prices

When customer has confirmed their complete order/booking, append this at the END of your reply:
<ORDER_READY>
{"items":[{"name":"Item","qty":1,"price":0}],"total":0,"notes":""}
</ORDER_READY>`;

  try {
    const res   = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role:"system", content:systemPrompt }, ...history],
      max_tokens: 400,
      temperature: 0.7,
    });

    const reply = res.choices[0].message.content;
    history.push({ role:"assistant", content:reply });
    saveSession(clientId, phone, { history });

    let order = null;
    const match = reply.match(/<ORDER_READY>([\s\S]*?)<\/ORDER_READY>/);
    if (match) {
      try {
        const data = JSON.parse(match[1].trim());
        order = createOrder(clientId, { phone, channel, items:data.items, total:data.total, notes:data.notes||"", customer:extractName(history) });
      } catch(e) { console.error("Order parse:", e.message); }
    }

    const paymentTriggered = reply.includes("<SEND_PAYMENT_SMS/>");
    const cleanReply = reply
      .replace(/<ORDER_READY>[\s\S]*?<\/ORDER_READY>/g,"")
      .replace(/<SEND_PAYMENT_SMS\/>/g,"")
      .trim();
    return { reply: cleanReply, order, paymentTriggered };
  } catch(err) {
    console.error("OpenAI error:", err.message);
    return { reply:`We're having a brief technical issue. Please try again shortly.`, order:null };
  }
}

function extractName(history) {
  for (const m of history) {
    if (m.role==="user") {
      const match = m.content.match(/(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]+)/i);
      if (match) return match[1];
    }
  }
  return "Guest";
}

module.exports = { chat };
