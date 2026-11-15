require("dotenv").config();

const express = require("express");
const session = require("express-session");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");

const api = require("./api");
const store = require("./brainhealth/store");

const app = express();
const port = Number(process.env.PORT) || 3000;
const clientDist = path.join(__dirname, "..", "dist"); // built React app (landing page + brain-health app)
const clientIndex = path.join(clientDist, "index.html");

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "eeg_analysis_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 },
  })
);

app.use("/api", api);
app.use("/eeg_data", express.static(path.join(__dirname, "EEG_Data_new")));
app.use(express.static(clientDist));

// Single-page app: every other GET serves index.html and the client router takes over.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/eeg_data/")) return next();
  if (!fs.existsSync(clientIndex)) return res.status(503).send("Build the web app first: run `npm run build` in the project root.");
  res.sendFile(clientIndex);
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "That file is larger than 50 MB." : err.message });
  }
  if (!err.expose) console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : "Something went wrong on the server." });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    store.flush();
    process.exit(0);
  });
}

app.listen(port, () => {
  console.log(`Earbud·EEG listening at http://localhost:${port}`);
  if (!store.load().participants.some((p) => p.simulated)) {
    console.log("No simulated demo cohort yet. Load it with: npm run seed");
  }
});
