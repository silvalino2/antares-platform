# Antares Platform v3
AI Automation Agency Platform — Voice Agents, WhatsApp Bots, Workflow Automation

## Deploy to Railway (Recommended)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Antares v3 initial deploy"
git remote add origin https://github.com/YOURUSERNAME/antares-platform.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Railway
1. Go to railway.app → New Project → Deploy from GitHub
2. Select antares-platform repo
3. Railway auto-deploys

### 3. Set Environment Variables on Railway
| Variable | Value |
|---|---|
| OPENAI_API_KEY | sk-xxxxxxxx |
| ADMIN_PASSWORD | your_strong_password |
| SESSION_SECRET | any_random_string |
| PORT | 3000 |
| BASE_URL | https://yourapp.up.railway.app |

### 4. Add a Volume (prevents data loss on redeploy)
Railway Dashboard → your project → + New → Volume
- Mount path: /data
- Then add env var: RAILWAY_VOLUME_MOUNT_PATH=/data

### 5. Access
- Admin panel: https://yourapp.up.railway.app/admin
- Client dashboard: https://yourapp.up.railway.app/dashboard?id=CLIENT_ID

## How It Works
1. You add a client in /admin (business name auto-fetches logo + brand colors)
2. Client stays in Pending until they pay you
3. You click Activate → Twilio webhooks configure automatically → agent goes live
4. Client dials *21*+TwilioNumber# on their MTN line to forward calls
5. Their customers call their normal number — Antares AI answers 24/7

## Stack
- Node.js + Express
- Socket.IO (real-time dashboard)
- OpenAI GPT-4o-mini (AI brain)
- Twilio (voice + SMS + WhatsApp)
- JSON flat file DB (swap for PostgreSQL when scaling)
