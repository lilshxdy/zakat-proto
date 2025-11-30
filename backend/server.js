const express = require("express");
const cors = require("cors");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "data");
const DONATIONS_FILE = path.join(DATA_DIR, "donations.json");

// make sure data directory & file exist
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  if (!fs.existsSync(DONATIONS_FILE)) {
    fs.writeFileSync(DONATIONS_FILE, "[]", "utf8"); // empty array
  }
}

// read all donations
function readDonations() {
  ensureStorage();
  const raw = fs.readFileSync(DONATIONS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// append a donation and save
function saveDonation(donation) {
  const all = readDonations();
  all.push(donation);
  fs.writeFileSync(DONATIONS_FILE, JSON.stringify(all, null, 2), "utf8");
}

app.get("/", (req, res) => {
  res.send("Zakat backend is running with storage");
});

// ---- DONATION ENDPOINT ----
app.post("/donate", (req, res) => {
  try {
    const { amount, note } = req.body;

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: "Amount must be > 0" });
    }

    const anonymousId = CryptoJS.SHA256(Date.now().toString()).toString();

    const receipt = {
      anonymousId,
      amount: numAmount,
      note: note || null,
      currency: "PKR",
      createdAt: new Date().toISOString(),
    };

    const metadataHash = CryptoJS.SHA256(
      JSON.stringify(receipt)
    ).toString();

    const donationRecord = {
      id: Date.now(), // simple ID
      metadataHash,
      receipt,
    };

    // 🔥 save to "database"
    saveDonation(donationRecord);

    return res.json({
      status: "ok",
      metadataHash,
      receipt,
      message: "Donation recorded (simulated) & stored.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---- LIST ALL DONATIONS ----
app.get("/donations", (req, res) => {
  try {
    const all = readDonations();
    return res.json(all);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not read donations" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  ensureStorage();
});
