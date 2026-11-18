// Adds the newer report visuals (full waveform, spectrogram, per-window seizure
// probabilities) to real recordings made before they existed. Run with the server stopped:
//   npm run reanalyze
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const secure = require("./secure");
const { execFileSync } = require("node:child_process");
const store = require("./store");
const { pythonBin } = require("../jobs");

const ROOT = path.join(__dirname, "..");
const db = store.load();
let updated = 0;

for (const s of db.sessions) {
  const r = s.eeg?.result;
  const upToDate = r?.spectrogram && r.seizure_screen?.events && r.spectra?.freqs?.at(-1) > 40;
  if (s.simulated || !r?.edf_file || upToDate) continue;
  let edf = path.join(ROOT, "EEG_Data_new", r.edf_file);
  let tmp = null;
  if (!fs.existsSync(edf) && fs.existsSync(edf + ".enc")) {
    // Recordings are encrypted at rest: decrypt to a temporary file just for this run.
    tmp = path.join(os.tmpdir(), `reanalyze_${process.pid}_${path.basename(edf)}`);
    fs.writeFileSync(tmp, secure.decryptFile(edf + ".enc"));
    edf = tmp;
  }
  if (!fs.existsSync(edf)) continue;
  const closed = r.protocol?.eyes_closed_s ?? 60;
  const open = r.protocol?.eyes_open_s ?? 60;
  const out = execFileSync(pythonBin(), ["-u", path.join(ROOT, "python", "brain_check.py"), "--reanalyze", edf,
    "--closed", String(closed), "--open", String(open), "--screen-seizures"], {
    cwd: ROOT, env: { ...process.env, TF_CPP_MIN_LOG_LEVEL: "2" }, stdio: ["ignore", "pipe", "ignore"],
  }).toString();
  if (tmp) fs.rmSync(tmp, { force: true });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("RESULT_JSON "));
  if (!line) continue;
  const fresh = JSON.parse(line.slice("RESULT_JSON ".length));
  r.waveform = fresh.waveform;
  r.spectrogram = fresh.spectrogram;
  if (fresh.spectra) r.spectra = fresh.spectra;
  delete s.verdict; // recomputed from the refreshed result
  r.features = { ...r.features, relative_power_open: fresh.features?.relative_power_open };
  if (fresh.seizure_screen) r.seizure_screen = { ...r.seizure_screen, ...fresh.seizure_screen, visualization: null };
  updated += 1;
  console.log(`Updated ${s.id} (${r.edf_file})`);
}
store.flush();
console.log(`${updated} recording(s) updated.`);
