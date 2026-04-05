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

// ── Admin Counter (Simple in-memory for live session) ────────
let activeAdmins = 0;

// ── API Endpoints ────────────────────────────────────────────

// Get all accounts with Pending status
app.get("/api/accounts/pending", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "==", "pending")
      .orderBy("added_at", "desc")
      .get();
    
    const accounts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(accounts);
  } catch (err) {
    console.error("Error fetching pending accounts:", err);
    res.status(500).json({ error: "Failed to fetch pending accounts" });
  }
});

// Get all accounts (Slide 1)
app.get("/api/accounts/all", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .orderBy("added_at", "desc")
      .get();
    
    const accounts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all accounts" });
  }
});

// Get Valid accounts (Slide 2)
app.get("/api/accounts/valid", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "==", "valid")
      .orderBy("added_at", "desc")
      .get();
    
    const accounts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch valid accounts" });
  }
});

// Get Invalid accounts (Slide 3)
app.get("/api/accounts/invalid", async (req, res) => {
  try {
    const snapshot = await db.collection("credentials")
      .where("status", "==", "invalid")
      .orderBy("added_at", "desc")
      .get();
    
    const accounts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch invalid accounts" });
  }
});

// Update account status
app.post("/api/accounts/status", async (req, res) => {
  const { ids, status } = req.body;
  if (!ids || !Array.isArray(ids) || !status) {
    return res.status(400).json({ error: "Invalid request body" });
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
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Admin Presence (Polling based)
app.post("/api/admin/heartbeat", (req, res) => {
  // In a real app, we'd use WebSockets or a TTL-based store like Redis
  // For this implementation, we'll just return a mock or simple counter
  res.json({ activeAdmins: activeAdmins || 1 });
});

// ── Routes ───────────────────────────────────────────────────
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`🚀 RobloxC Dashboard Live on Port ${PORT}`);
});
