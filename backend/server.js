const express = require("express");
const cors = require("cors");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------- STORAGE SETUP ----------
const DATA_DIR = path.join(__dirname, "data");
const DONATIONS_FILE = path.join(DATA_DIR, "donations.json");
const BLOCKCHAIN_FILE = path.join(DATA_DIR, "blockchain-log.json");

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  if (!fs.existsSync(DONATIONS_FILE)) {
    fs.writeFileSync(DONATIONS_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(BLOCKCHAIN_FILE)) {
    fs.writeFileSync(BLOCKCHAIN_FILE, "[]", "utf8");
  }
}

function readJson(filePath) {
  ensureStorage();
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readDonations() {
  return readJson(DONATIONS_FILE);
}

function saveDonation(donation) {
  const all = readDonations();
  all.push(donation);
  writeJson(DONATIONS_FILE, all);
}

// very simple "AI" classifier based on keywords in the note
function classifyCategory(noteRaw) {
  if (!noteRaw) return "General";

  const note = noteRaw.toLowerCase();

  if (note.includes("food") || note.includes("ration") || note.includes("grocery"))
    return "Food";

  if (note.includes("school") || note.includes("fees") || note.includes("education") || note.includes("study"))
    return "Education";

  if (note.includes("hospital") || note.includes("medicine") || note.includes("medical") || note.includes("treatment"))
    return "Medical";

  if (note.includes("orphan") || note.includes("widow") || note.includes("yateem"))
    return "Orphans / Widows";

  if (note.includes("ramzan") || note.includes("fitra") || note.includes("eid"))
    return "Ramzan / Fitra";

  return "General";
}

// ------- simulated blockchain log -------
function readBlockchainLog() {
  return readJson(BLOCKCHAIN_FILE);
}

function appendBlockchainRecord(metadataHash) {
  const log = readBlockchainLog();
  log.push({
    txId: Date.now(), // fake tx id
    metadataHash,
    network: "Simulated chain",
    createdAt: new Date().toISOString(),
  });
  writeJson(BLOCKCHAIN_FILE, log);
}

// ---------- ROUTES ----------

app.get("/", (req, res) => {
  res.send("Zakat backend is running with storage + simulated blockchain");
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
    const category = classifyCategory(note || "");

    const receipt = {
      anonymousId,
      amount: numAmount,
      note: note || null,
      category,
      currency: "PKR",
      createdAt: new Date().toISOString(),
    };

    const metadataHash = CryptoJS.SHA256(
      JSON.stringify(receipt)
    ).toString();

    const donationRecord = {
      id: Date.now(),
      metadataHash,
      receipt,
    };

    // save to donations "db"
    saveDonation(donationRecord);

    // simulate writing hash on-chain
    appendBlockchainRecord(metadataHash);

    return res.json({
      status: "ok",
      metadataHash,
      receipt,
      message:
        "Donation recorded (simulated), stored, and hash logged to simulated blockchain.",
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

// ---- LIST BLOCKCHAIN LOG (simulated) ----
app.get("/blockchain-log", (req, res) => {
  try {
    const log = readBlockchainLog();
    return res.json(log);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not read blockchain log" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  ensureStorage();
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
