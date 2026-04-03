# 🤖 Roblox Account Validator

A **production-ready** Node.js backend service that automatically validates Roblox account credentials stored in Firebase Firestore. Deployed on Render with a beautiful live dashboard.

## ✨ Features

- ✅ **Automated Validation** - Processes pending credentials every 30 seconds via cron jobs
- 🎨 **Live Dashboard** - Real-time stats and credential status tracking
- 🔐 **Firebase Integration** - Secure credential storage and processing
- 🌐 **Puppeteer Automation** - Browser-based Roblox login validation
- 🛡️ **Proxy Support** - Rotate proxies to avoid rate limiting
- 📊 **REST API** - Simple endpoints for stats and pending credentials
- 🚀 **Render Ready** - One-click deployment with environment variables

## 📋 Prerequisites

- Node.js 18+
- Firebase project with Firestore database
- Firebase service account credentials
- (Optional) Proxy list for production deployment

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/loidkaizer-design/RobloxC-Backend-Server.git
cd RobloxC-Backend-Server
npm install
```

### 2. Add Firebase Credentials

1. Get your Firebase service account JSON from [Firebase Console](https://console.firebase.google.com/)
2. Save it as `oren-devs-firebase-adminsdk.json` in the project root
3. **⚠️ Never commit this file** (already in .gitignore)

### 3. Setup Firestore Database

Your Firestore `credentials` collection should have documents like:

```json
{
  "username": "roblox_username",
  "password": "password123",
  "status": "pending",
  "added_at": "2026-04-03T10:00:00Z"
}
```

**Status values:**
- `pending` - Waiting to be validated
- `valid` - Account credentials are correct
- `invalid` - Account credentials are incorrect
- `error` - Validation error occurred

### 4. Run Locally

```bash
npm start
```

Visit `http://localhost:3000` to see the live dashboard.

## 📡 API Endpoints

### Get Statistics

```bash
GET /api/stats
```

Response:
```json
{
  "processed": 42,
  "valid": 15,
  "invalid": 27
}
```

### Get Pending Credentials (limit 20)

```bash
GET /api/pending
```

Response:
```json
[
  {
    "id": "doc_id_123",
    "username": "roblox_user",
    "password": "***",
    "status": "pending",
    "added_at": { "seconds": 1712145600 }
  }
]
```

## 🌍 Deploy to Render

### Step 1: Connect GitHub

1. Push your repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository

### Step 2: Configure Environment

Set these environment variables in Render:

| Variable | Value |
|----------|-------|
| `PORT` | `3000` |
| `NODE_ENV` | `production` |

### Step 3: Upload Firebase Credentials

**Option A: Environment Variable (Recommended)**
1. Get your Firebase JSON and convert it to a single-line string
2. Add as environment variable: `FIREBASE_CONFIG`
3. Update `validator.js` line 8:
   ```javascript
   const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
   ```

**Option B: Direct File Upload**
1. Use Render's file upload feature
2. Upload `oren-devs-firebase-adminsdk.json` to `/etc/secrets/`

### Step 4: Deploy

Click "Deploy" and Render will automatically:
- Install dependencies (`npm install`)
- Start the server (`npm start`)
- Run the validator every 30 seconds

## 🔧 Configuration

### Update Proxy List

Edit `validator.js` line 20:

```javascript
const proxies = [
  'http://your-proxy:port',
  'http://another-proxy:port',
  // Add free proxies or use a proxy service
];
```

### Change Validation Interval

Edit `validator.js` line 123:

```javascript
// Change from every 30 seconds
cron.schedule('*/30 * * * * *', processPending);

// To every 5 seconds
cron.schedule('*/5 * * * * *', processPending);

// To every minute
cron.schedule('0 * * * *', processPending);
```

## 📊 Dashboard Features

- **📈 Real-time Stats** - See processed, valid, and invalid counts
- **⏳ Pending Queue** - View all credentials waiting for validation
- **🔄 Auto-refresh** - Updates every 5 seconds
- **📱 Responsive Design** - Works on mobile and desktop
- **🎨 Modern UI** - Dark theme with gradient stats cards

## 🐛 Troubleshooting

### Error: "Service account JSON not found"

```bash
# Make sure the file exists
ls -la oren-devs-firebase-adminsdk.json
```

### Error: "Timeout waiting for element"

- Roblox UI may have changed
- Update selectors in `validateCredential()` function
- Add more proxies to avoid rate limiting

### Proxy Connection Failed

- Test proxy with: `curl -x http://proxy:port http://roblox.com`
- Replace dead proxies in the proxies array
- Consider using a paid proxy service

### Firestore Connection Error

- Verify service account has Firestore read/write permissions
- Check Firebase security rules allow operations
- Ensure Firestore database is initialized

## 📝 Logs

Check the Render logs for validation output:

```
🔍 Validating: username123
📥 Processing: username123
✅ VALID: username123
📊 Stats: 1 processed | 1 valid | 0 invalid
```

## ⚠️ Legal Notice

This tool is for **educational purposes only**. Using it to:
- Access accounts without permission is illegal
- Bypass security measures violates terms of service
- Store credentials improperly violates privacy laws

Use responsibly and only with authorized accounts.

## 📦 Dependencies

- **firebase-admin** - Firestore database access
- **puppeteer** - Browser automation
- **puppeteer-extra-plugin-stealth** - Bypass detection
- **node-cron** - Schedule validation jobs
- **express** - REST API server
- **cors** - Cross-origin resource sharing

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📄 License

MIT License - Use freely in your projects

---

**Made with ❤️ by Oren Dev**