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

// ---------- "AI" FRAUD / RISK SCORING ----------
function scoreRisk(amount, noteRaw, walletAddress) {
  let score = 0;
  const flags = [];

  const note = (noteRaw || "").toLowerCase();

  // large amount thresholds (you can tweak)
  if (amount >= 200000) {
    score += 50;
    flags.push("Very large donation amount");
  } else if (amount >= 50000) {
    score += 25;
    flags.push("Large donation compared to normal");
  }

  // suspicious keywords
  const susWords = ["refund", "chargeback", "scam", "fraud", "hack", "stolen"];
  if (susWords.some((w) => note.includes(w))) {
    score += 30;
    flags.push("Suspicious wording in note");
  }

  // no wallet attached = tiny risk bump
  if (!walletAddress) {
    score += 5;
    flags.push("No crypto wallet linked");
  }

  // cap at 100
  const finalScore = Math.min(100, score);

  let level = "Low";
  if (finalScore >= 70) level = "High";
  else if (finalScore >= 40) level = "Medium";

  return {
    score: finalScore,
    level,
    flags,
  };
}

// ------- simulated blockchain with real blocks -------
function readBlockchainLog() {
  return readJson(BLOCKCHAIN_FILE);
}

function writeBlockchainLog(data) {
  writeJson(BLOCKCHAIN_FILE, data);
}

function appendBlockchainBlock(metadataHash) {
  const chain = readBlockchainLog();
  const index = chain.length;
  const prevHash = index === 0 ? "GENESIS" : chain[index - 1].blockHash;
  const createdAt = new Date().toISOString();

  const payload = JSON.stringify({
    index,
    metadataHash,
    prevHash,
    createdAt,
  });

  const blockHash = CryptoJS.SHA256(payload).toString();

  const block = {
    index,
    metadataHash,
    prevHash,
    blockHash,
    createdAt,
    network: "Simulated chain",
  };

  chain.push(block);
  writeBlockchainLog(chain);

  return block;
}

// ------- Merkle tree utilities -------
function computeMerkleRoot(hashes) {
  if (!hashes || hashes.length === 0) return null;

  let level = hashes.slice();

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left; // duplicate last if odd
      const combined = left + right;
      next.push(CryptoJS.SHA256(combined).toString());
    }
    level = next;
  }

  return level[0];
}

// ---------- ROUTES ----------

app.get("/", (req, res) => {
  res.send(
    "Zakat backend running with storage, AI categories, risk scoring, simulated blockchain & Merkle root."
  );
});

// ---- DONATION ENDPOINT ----
app.post("/donate", (req, res) => {
  try {
    const { amount, note, walletAddress } = req.body;

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: "Amount must be > 0" });
    }

    const anonymousId = CryptoJS.SHA256(Date.now().toString()).toString();
    const category = classifyCategory(note || "");
    const risk = scoreRisk(numAmount, note || "", walletAddress || null);

    const receipt = {
      anonymousId,
      amount: numAmount,
      note: note || null,
      category,
      currency: "PKR",
      walletAddress: walletAddress || null,
      risk,
      createdAt: new Date().toISOString(),
    };

    const metadataHash = CryptoJS.SHA256(JSON.stringify(receipt)).toString();

    const donationRecord = {
      id: Date.now(),
      metadataHash,
      receipt,
    };

    // save donation
    saveDonation(donationRecord);

    // append new block to simulated chain
    const block = appendBlockchainBlock(metadataHash);

    return res.json({
      status: "ok",
      metadataHash,
      receipt,
      block,
      message:
        "Donation recorded, risk-scored, stored, and included in simulated blockchain.",
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

// ---- LIST BLOCKCHAIN LOG (blocks) ----
app.get("/blockchain-log", (req, res) => {
  try {
    const log = readBlockchainLog();
    return res.json(log);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not read blockchain log" });
  }
});

// ---- MERKLE TREE INFO ----
app.get("/merkle-tree", (req, res) => {
  try {
    const donations = readDonations();
    const leaves = donations.map((d) => ({
      id: d.id,
      hash: d.metadataHash,
    }));
    const hashes = leaves.map((l) => l.hash);
    const root = computeMerkleRoot(hashes);

    return res.json({
      root,
      leafCount: leaves.length,
      leaves,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not compute Merkle root" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  ensureStorage();
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
