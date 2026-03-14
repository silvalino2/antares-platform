// Brand Fetcher — auto-pulls logo, colors, personality from business name
const axios   = require("axios");
const cheerio = require("cheerio");

const BUSINESS_TYPES = {
  restaurant:  ["restaurant","grill","chop","kitchen","eatery","diner","bistro","cafe","food","pizza","burger","suya","buka","bar"],
  realestate:  ["real estate","realty","properties","homes","housing","property","estate","realtor","land"],
  hotel:       ["hotel","lodge","inn","resort","suites","hospitality","accommodation","guest house"],
  salon:       ["salon","spa","beauty","barber","hair","nails","wellness","aesthetics","skincare"],
  hospital:    ["hospital","clinic","medical","health","pharmacy","dental","doctor","healthcare"],
  ecommerce:   ["store","shop","mart","market","supermarket","boutique","fashion","clothing"],
  logistics:   ["logistics","courier","delivery","shipping","transport","dispatch","haulage"],
  school:      ["school","academy","college","university","institute","education","learning"],
  finance:     ["bank","finance","microfinance","investment","insurance","fintech","loan"],
  gym:         ["gym","fitness","sport","athletic","crossfit","yoga","pilates"],
};

function detectBusinessType(name) {
  const lower = name.toLowerCase();
  for (const [type, keywords] of Object.entries(BUSINESS_TYPES)) {
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return "business";
}

function getTypeColors(type) {
  const palettes = {
    restaurant:  { primary: "#8B1A1A", secondary: "#C9A84C", accent: "#E4C97E", bg: "#0F0905", surface: "#1A1008", surface2: "#221508", text: "#F5EDD8", muted: "#8A7060", border: "rgba(201,168,76,0.15)" },
    realestate:  { primary: "#1A3A5C", secondary: "#C9A84C", accent: "#E4C97E", bg: "#080C10", surface: "#0F1620", surface2: "#161E2A", text: "#E8EDF5", muted: "#607080", border: "rgba(76,138,201,0.15)" },
    hotel:       { primary: "#3D1F0A", secondary: "#D4AF37", accent: "#F0D060", bg: "#0A0705", surface: "#160E08", surface2: "#1E1410", text: "#F5F0E8", muted: "#806050", border: "rgba(212,175,55,0.15)" },
    salon:       { primary: "#6B2D5E", secondary: "#E8A0C0", accent: "#F5C8DC", bg: "#0C0509", surface: "#180B14", surface2: "#22101C", text: "#F5E8F0", muted: "#806878", border: "rgba(232,160,192,0.15)" },
    hospital:    { primary: "#0D4F6C", secondary: "#4ECDC4", accent: "#80E8E0", bg: "#050D10", surface: "#0A1A20", text: "#E8F5F5", muted: "#508090", border: "rgba(78,205,196,0.15)" },
    ecommerce:   { primary: "#1A1A2E", secondary: "#E94560", accent: "#FF7088", bg: "#080810", surface: "#10101E", text: "#F0F0FF", muted: "#707090", border: "rgba(233,69,96,0.15)" },
    logistics:   { primary: "#1A3A1A", secondary: "#4CAF50", accent: "#80C880", bg: "#050805", surface: "#0D150D", text: "#E8F5E8", muted: "#508050", border: "rgba(76,175,80,0.15)" },
    school:      { primary: "#1C3A6B", secondary: "#F5A623", accent: "#FFD080", bg: "#060810", surface: "#0E1520", text: "#EEF2FF", muted: "#607090", border: "rgba(245,166,35,0.15)" },
    finance:     { primary: "#0D2137", secondary: "#00D4AA", accent: "#60EED0", bg: "#040810", surface: "#0A1420", text: "#E8F5F5", muted: "#408080", border: "rgba(0,212,170,0.15)" },
    gym:         { primary: "#1A0A0A", secondary: "#FF4444", accent: "#FF8080", bg: "#080404", surface: "#140A0A", text: "#FFF0F0", muted: "#806060", border: "rgba(255,68,68,0.15)" },
    business:    { primary: "#1A1A2E", secondary: "#C9A84C", accent: "#E4C97E", bg: "#080810", surface: "#10101E", text: "#F0F0FF", muted: "#707090", border: "rgba(201,168,76,0.15)" },
  };
  return palettes[type] || palettes.business;
}

async function fetchBrandData(businessName) {
  const type = detectBusinessType(businessName);
  const colors = getTypeColors(type);

  // Try Clearbit Logo API
  let logoUrl = null;
  const slug  = businessName.toLowerCase().replace(/[^a-z0-9]/g,"") + ".com";
  const clearbitUrl = `https://logo.clearbit.com/${slug}`;
  try {
    const r = await axios.head(clearbitUrl, { timeout: 4000 });
    if (r.status === 200) logoUrl = clearbitUrl;
  } catch (e) {}

  // Fallback: UI Avatars with brand color
  if (!logoUrl) {
    const initials = businessName.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
    logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${colors.secondary.replace("#","")}&color=${colors.bg.replace("#","")}&size=200&bold=true&font-size=0.45`;
  }

  return { logoUrl, businessType: type, colors };
}

function generatePersonality(businessName, businessType, extraInfo="") {
  const personas = {
    restaurant:  `You are a warm and professional AI customer care agent for ${businessName}. You take food orders, answer menu questions, handle reservations, and provide payment instructions. You represent the restaurant with elegance and make every customer feel valued. Keep calls conversational and SMS/WhatsApp replies concise.`,
    realestate:  `You are a knowledgeable AI assistant for ${businessName}. You help clients enquire about property listings, schedule viewings, get valuations, and connect with agents. Ask qualifying questions to understand client needs. Speak with authority and confidence.`,
    hotel:       `You are a courteous AI concierge for ${businessName}. You assist guests with bookings, availability, amenities, and special requests. Maintain a warm five-star hospitality tone at all times.`,
    salon:       `You are a friendly AI booking assistant for ${businessName}. You book appointments, share service prices, check availability, and make clients excited about their visit. Be upbeat and warm.`,
    hospital:    `You are a calm and professional AI assistant for ${businessName}. You help patients book appointments, find departments, and understand services. Always direct urgent cases to call emergency lines immediately.`,
    ecommerce:   `You are a helpful AI shopping assistant for ${businessName}. You help customers find products, place orders, track deliveries, and resolve enquiries. Be knowledgeable and aim to genuinely help.`,
    logistics:   `You are an efficient AI operations assistant for ${businessName}. You book pickups, track shipments, provide quotes, and resolve delivery issues. Be precise and give clear timelines.`,
    school:      `You are a helpful AI admissions assistant for ${businessName}. You share program info, fees, admission requirements, and important dates. Be encouraging and informative.`,
    finance:     `You are a professional AI customer service agent for ${businessName}. You handle account enquiries, product information, and loan applications. Always note that specific financial advice comes from human advisors.`,
    gym:         `You are an energetic AI membership assistant for ${businessName}. You share membership plans, class schedules, personal training options, and facilities. Be motivating and positive.`,
    business:    `You are a professional AI customer care agent for ${businessName}. You handle enquiries, provide product and service information, and help customers efficiently. Be polite, knowledgeable, and professional.`,
  };
  let base = personas[businessType] || personas.business;
  if (extraInfo) base += `\n\nExtra context: ${extraInfo}`;
  return base;
}

module.exports = { fetchBrandData, detectBusinessType, generatePersonality, getTypeColors };
