require("dotenv").config();

const express = require("express");
const { spawn } = require("node:child_process");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs");
const { OpenAI } = require("openai");
const bcrypt = require("bcrypt");
const session = require("express-session");
const mongoose = require("mongoose");
const app = express();
const port = 3000;
const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/eeg_analysis_app";
const outputDir = path.join(__dirname, "EEG_Data_new");
const clientDist = path.join(__dirname, "..", "dist"); // built Vite marketing site

// One unified waitlist for everything (analysis, prediction, hardware).
const WAITLIST = {
  label: "Earbud EEG early access",
  title: "Join The Waitlist",
  description:
    "Earbud EEG is launching soon. Add your email and we'll reach out as access opens.",
};

function renderWaitlist(req, res, options = {}) {
  res.render("waitlist", {
    userName: req.session.userName,
    featureInfo: WAITLIST,
    submitted: options.submitted || false,
    notice: options.notice || "",
    errorMessage: options.errorMessage || "",
    formData: options.formData || {},
  });
}

// Connect to MongoDB
mongoose
  .connect(mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

const waitlistSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  email: { type: String, required: true, lowercase: true, trim: true },
  feature: { type: String, required: true },
  featureLabel: { type: String, required: true },
  notes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

waitlistSchema.index({ email: 1, feature: 1 }, { unique: true });

const WaitlistEntry = mongoose.model("WaitlistEntry", waitlistSchema, "AeroMind");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + extension);
  },
});

const upload = multer({ storage: storage });

app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(express.static(clientDist)); // marketing site (/, /assets, /fonts, /favicon.svg)
app.use("/eeg_data", express.static(path.join(__dirname, "EEG_Data_new")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "eeg_analysis_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Authentication middleware
// DEMO MODE: login is bypassed — every visitor gets a guest session.
// To re-enable auth, restore the commented block below.
const isAuthenticated = (req, res, next) => {
  if (!req.session.userId) {
    req.session.userId = "guest";
    req.session.userName = "Guest";
  }
  return next();
  // if (req.session?.userId) return next();
  // res.redirect("/");
};

// Routes
app.get("/", (req, res) => {
  // Serve the Vite marketing landing page (built into ../dist).
  res.sendFile(path.join(clientDist, "index.html"));
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Set session
    req.session.userId = user._id;
    req.session.userName = user.name;

    return res.json({ success: true, message: "Login successful" });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Email already in use" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    return res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return console.error("Logout error:", err);
    }
    res.redirect("/");
  });
});

app.get("/dashboard", isAuthenticated, (req, res) => {
  res.render("dashboard", {
    userName: req.session.userName,
  });
});

app.get("/waitlist", (req, res) => {
  renderWaitlist(req, res);
});

app.get("/join-waitlist", (req, res) => {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(`/waitlist${query}`);
});

app.post("/waitlist", async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 180);
  const notes = String(body.notes || "").trim().slice(0, 600);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).render("waitlist", {
      userName: req.session.userName,
      featureInfo: WAITLIST,
      submitted: false,
      notice: "",
      errorMessage: "Please enter a valid email address to join the waitlist.",
      formData: { name, email, notes },
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).render("waitlist", {
      userName: req.session.userName,
      featureInfo: WAITLIST,
      submitted: false,
      notice: "",
      errorMessage:
        "We couldn't reach the waitlist just now. Please try again in a moment.",
      formData: { name, email, notes },
    });
  }

  try {
    await WaitlistEntry.findOneAndUpdate(
      { email },
      {
        $set: {
          name,
          email,
          feature: "waitlist",
          featureLabel: WAITLIST.label,
          notes,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return renderWaitlist(req, res, {
      submitted: true,
      formData: { name, email, notes },
    });
  } catch (error) {
    console.error("Waitlist save error:", error);
    return res.status(500).render("waitlist", {
      userName: req.session.userName,
      featureInfo: WAITLIST,
      submitted: false,
      notice: "",
      errorMessage:
        "Something went wrong saving your spot. Please try again in a moment.",
      formData: { name, email, notes },
    });
  }
});

app.get("/analyze", isAuthenticated, (req, res) => {
  renderWaitlist(req, res);
});

app.post("/analyze", isAuthenticated, (req, res) => {
  return renderWaitlist(req, res, {
    notice:
      "Live EEG analysis needs the Earbud EEG hardware. Join the waitlist and we'll reach out as access opens.",
  });

  if (!req.body?.patientId) {
    return res.status(400).render("error", {
      error: "Missing required parameter",
      details: "Patient ID is required",
    });
  }

  const patientId = req.body.patientId;
  const duration = req.body.duration || 10;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(
    `Starting EEG analysis for patient ${patientId} for ${duration} seconds`
  );

  const pythonProcess = spawn("python", [
    path.join(__dirname, "python", "eeg_processor.py"),
    patientId,
    duration,
  ]);

  let pythonData = "";
  let pythonError = "";

  pythonProcess.stdout.on("data", (data) => {
    pythonData += data.toString();
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    pythonError += data.toString();
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);

    if (code !== 0) {
      const pythonOutput = `${pythonData}\n${pythonError}`;
      const isPortDisconnected =
        code === 2 ||
        pythonOutput.includes("PORT_STATUS: NOT_CONNECTED") ||
        /could not connect|not connected|cannot find|access is denied|serial/i.test(pythonOutput);

      if (isPortDisconnected) {
        return res.render("error", {
          error: "EEG Earbud Not Connected",
          details:
            "Please connect the EEG earbud to the system before starting EEG data collection.\n\n" +
            "After connecting it, confirm the device is available on COM3 and start the analysis again.",
          userName: req.session.userName,
        });
      }
      if (pythonData.includes("SIGNAL_QUALITY: NO_DATA")) {
        return res.render("error", {
          error: "No EEG Data Received",
          details:
            "The Arduino connection opened, but the app did not receive enough EEG samples.\n\n" +
            "Check the firmware output, baud rate, electrode wiring, and serial stream, then try again.",
          userName: req.session.userName,
        });
      }
      if (pythonData.includes("SIGNAL_QUALITY: INSUFFICIENT")) {
        return res.render("error", {
          error: "No Electrode Signal Detected",
          details:
            "The EEG signal is flat — the earbud or electrode does not appear to be in contact with the skin.\n\n" +
            "Please ensure the electrode is properly placed and the gel/contact is secure, then try again.",
          userName: req.session.userName,
        });
      }
      return res.render("error", {
        error: "EEG Analysis Failed",
        details:
          pythonOutput.trim() ||
          "The EEG analysis could not be completed. Please connect the EEG earbud and try again.",
        userName: req.session.userName,
      });
    }

    const files = fs.readdirSync(outputDir);
    const imageFiles = files.filter(
      (file) => file.includes(`eeg_plot_${patientId}`) && file.endsWith(".png")
    );

    imageFiles.sort((a, b) => {
      return (
        fs.statSync(path.join(outputDir, b)).mtime.getTime() -
        fs.statSync(path.join(outputDir, a)).mtime.getTime()
      );
    });

    const edfFiles = files.filter(
      (file) => file.includes(`eeg_${patientId}`) && file.endsWith(".edf")
    );

    edfFiles.sort((a, b) => {
      return (
        fs.statSync(path.join(outputDir, b)).mtime.getTime() -
        fs.statSync(path.join(outputDir, a)).mtime.getTime()
      );
    });

    const reportFiles = files.filter(
      (file) =>
        file.includes(`eeg_analysis_${patientId}`) && file.endsWith(".txt")
    );

    reportFiles.sort((a, b) => {
      return (
        fs.statSync(path.join(outputDir, b)).mtime.getTime() -
        fs.statSync(path.join(outputDir, a)).mtime.getTime()
      );
    });

    let reportContent = "";
    if (reportFiles.length > 0) {
      reportContent = fs.readFileSync(
        path.join(outputDir, reportFiles[0]),
        "utf8"
      );
    }

    res.render("results", {
      patientId: patientId,
      duration: duration,
      imageFile: imageFiles.length > 0 ? imageFiles[0] : null,
      edfFile: edfFiles.length > 0 ? edfFiles[0] : null,
      reportContent: reportContent,
      pythonOutput: pythonData,
      userName: req.session.userName,
    });
  });
});

app.get("/predict", isAuthenticated, (req, res) => {
  res.render("predict", {
    userName: req.session.userName,
  });
});

app.post("/predict", isAuthenticated, (req, res) => {
  return renderWaitlist(req, res, {
    notice:
      "Seizure prediction needs the Earbud EEG hardware. Join the waitlist and we'll reach out as access opens.",
  });

  if (!req.file) {
    return res.render("error", {
      error: "No file uploaded",
      details: "Please upload an EDF file",
      userName: req.session.userName,
    });
  }

  const edfFilePath = req.file.path;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Starting seizure prediction for file: ${req.file.originalname}`);

  const pythonProcess = spawn("python", [
    path.join(__dirname, "python", "predict_seizure.py"),
    edfFilePath,
    outputDir,
  ]);

  let pythonData = "";
  let pythonError = "";

  pythonProcess.stdout.on("data", (data) => {
    pythonData += data.toString();
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    pythonError += data.toString();
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);

    if (code !== 0) {
      return res.render("error", {
        error: "Seizure Prediction Failed",
        details:
          `${pythonData}\n${pythonError}`.trim() ||
          "The uploaded EDF file could not be analyzed. Please check the file and try again.",
        userName: req.session.userName,
      });
    }

    let prediction = "Unknown";
    let confidence = "0%";
    let visualizationFile = "";

    try {
      const outputLines = pythonData.split("\n");
      for (const line of outputLines) {
        if (line.includes("Result:")) {
          prediction = line.split("Result:")[1].trim();
        } else if (line.includes("Confidence:")) {
          confidence = line.split("Confidence:")[1].trim();
        } else if (line.includes("Visualization saved to:")) {
          const fullPath = line.split("Visualization saved to:")[1].trim();
          visualizationFile = path.basename(fullPath);
        }
      }
    } catch (err) {
      console.error("Error parsing Python output:", err);
    }

    res.render("prediction_results", {
      fileName: req.file.originalname,
      prediction: prediction,
      confidence: confidence,
      visualizationFile: visualizationFile,
      pythonOutput: pythonData,
      userName: req.session.userName,
    });
  });
});

app.post("/chat", async (req, res) => {
  const { userInput, pageType, eegData } = req.body;

  const systemPrompts = {
    home: "You are an EEG specialist. Answer general EEG-related queries.",
    seizure: "You are a Seizure Specialist. Provide expert medical guidance on seizures.",
    recording: `You are an EEG data analyst. Analyze the given EEG data and provide meaningful insights. Here is the EEG data: ${eegData}`,
  };
  const systemPrompt = systemPrompts[pageType] ?? systemPrompts.home;

  try {
    console.log(`Sending request to OpenAI (pageType=${pageType})`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userInput },
      ],
    });

    const reply = completion.choices[0]?.message?.content;
    if (reply) {
      res.json({ reply });
    } else {
      console.error("Unexpected OpenAI response:", completion);
      res.status(500).json({ error: "Invalid response from OpenAI" });
    }
  } catch (error) {
    console.error("Error with OpenAI API:", error.message);
    res.status(500).json({ error: "Failed to get response from OpenAI" });
  }
});

// Handle 404
app.use((req, res) => {
  res.status(404).render("error", {
    error: "Page Not Found",
    details: "The page you are looking for does not exist.",
    userName: req.session.userId ? req.session.userName : null,
  });
});

// Start the server
app.listen(port, () => {
  console.log(`EEG Analysis app listening at http://localhost:${port}`);
});
