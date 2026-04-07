const express = require("express");
const cors = require("cors");
const path = require("path");
const admin = require("firebase-admin");

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
  console.log("✅ Firebase initialized successfully");
} catch (err) {
  console.error("❌ Firebase Init Failed:", err.message);
  process.exit(1);
}

const db = admin.firestore();

// ── Express App ──────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Health Check ─────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// ── Helper ───────────────────────────────────────────────────
async function fetchByStatus(status) {
  const snapshot = await db.collection("credentials")
    .where("status", "==", status)
    .orderBy("added_at", "desc")
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ── Stats ────────────────────────────────────────────────────
app.get("/api/stats", async (req, res) => {
  try {
    const [allSnap, validSnap, invalidSnap, pendingSnap] = await Promise.all([
      db.collection("credentials").get(),
      db.collection("credentials").where("status", "==", "valid").get(),
      db.collection("credentials").where("status", "==", "invalid").get(),
      db.collection("credentials").where("status", "==", "pending").get(),
    ]);
    res.json({
      total:   allSnap.size,
      valid:   validSnap.size,
      invalid: invalidSnap.size,
      pending: pendingSnap.size,
    });
  } catch (err) {
    console.error("Error fetching stats:", err.message);
    res.status(500).json({ error: "Failed to fetch stats", detail: err.message });
  }
});

// ── Get Pending ───────────────────────────────────────────────
app.get("/api/accounts/pending", async (req, res) => {
  try {
    res.json(await fetchByStatus("pending"));
  } catch (err) {
    console.error("Error fetching pending:", err.message);
    res.status(500).json({ error: "Failed to fetch pending accounts", detail: err.message });
  }
});

// ── Get All ───────────────────────────────────────────────────
app.get("/api/accounts/all", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .orderBy("added_at", "desc")
      .get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error("Error fetching all:", err.message);
    res.status(500).json({ error: "Failed to fetch all accounts", detail: err.message });
  }
});

// ── Get Valid ─────────────────────────────────────────────────
app.get("/api/accounts/valid", async (req, res) => {
  try {
    res.json(await fetchByStatus("valid"));
  } catch (err) {
    console.error("Error fetching valid:", err.message);
    res.status(500).json({ error: "Failed to fetch valid accounts", detail: err.message });
  }
});

// ── Get Invalid ───────────────────────────────────────────────
app.get("/api/accounts/invalid", async (req, res) => {
  try {
    res.json(await fetchByStatus("invalid"));
  } catch (err) {
    console.error("Error fetching invalid:", err.message);
    res.status(500).json({ error: "Failed to fetch invalid accounts", detail: err.message });
  }
});

// ── Update Status ─────────────────────────────────────────────
app.post("/api/accounts/status", async (req, res) => {
  const { ids, status } = req.body;
  const allowed = ["pending", "valid", "invalid", "error"];

  if (!ids || !Array.isArray(ids) || ids.length === 0 || !status) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  if (!allowed.includes(status.toLowerCase())) {
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}` });
  }

  try {
    const batch = db.batch();
    ids.forEach(id => {
      const ref = db.collection("credentials").doc(id);
      batch.update(ref, {
        status: status.toLowerCase(),
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    console.log(`✅ Updated ${ids.length} account(s) to "${status}"`);
    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error("Error updating status:", err.message);
    res.status(500).json({ error: "Failed to update status", detail: err.message });
  }
});

// ── Delete Account ────────────────────────────────────────────
app.delete("/api/accounts/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing account ID" });

  try {
    await db.collection("credentials").doc(id).delete();
    console.log(`🗑️  Deleted account: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting account:", err.message);
    res.status(500).json({ error: "Failed to delete account", detail: err.message });
  }
});

// ── Admin Heartbeat ───────────────────────────────────────────
app.post("/api/admin/heartbeat", (req, res) => {
  res.json({ activeAdmins: 1 });
});

// ── Routes ────────────────────────────────────────────────────
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/email",     (req, res) => res.sendFile(path.join(__dirname, "public", "email.html")));
app.get("*",          (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`🚀 RobloxC Dashboard live on port ${PORT}`);
});
