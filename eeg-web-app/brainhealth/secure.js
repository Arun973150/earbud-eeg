// Local encryption at rest: AES-256-GCM with a random 32-byte data key.
// On Windows the data key is wrapped with DPAPI (tied to this Windows user account), so a
// copied data folder is unreadable elsewhere. On other systems the key is derived from
// EEG_PASSPHRASE with scrypt. The key itself only ever lives in memory.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const MAGIC = Buffer.from("EEGENC1\0", "latin1"); // 8 bytes: format + version
const IV_LEN = 12;
const TAG_LEN = 16;

const DATA_DIR = () => process.env.DATA_DIR || path.join(__dirname, "..", "data");

// DPAPI through Windows PowerShell; the key travels over stdin, never on the command line.
function dpapi(op, input) {
  const script =
    "Add-Type -AssemblyName System.Security; $in = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); " +
    `$out = [Security.Cryptography.ProtectedData]::${op}($in, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
    "[Console]::Out.Write([Convert]::ToBase64String($out))";
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: input.toString("base64"), windowsHide: true, maxBuffer: 1 << 20,
  });
  return Buffer.from(out.toString("utf8").trim(), "base64");
}

const protector = {
  protect: (key) => dpapi("Protect", key),
  unprotect: (blob) => dpapi("Unprotect", blob),
};

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  if (process.env.EEG_TEST_KEY) {
    cachedKey = crypto.createHash("sha256").update(process.env.EEG_TEST_KEY).digest();
    return cachedKey;
  }
  const dir = DATA_DIR();
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === "win32" && !process.env.EEG_PASSPHRASE) {
    const file = path.join(dir, "key.dpapi");
    if (fs.existsSync(file)) {
      cachedKey = module.exports.protector.unprotect(Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64"));
    } else {
      cachedKey = crypto.randomBytes(32);
      fs.writeFileSync(file, module.exports.protector.protect(cachedKey).toString("base64"));
    }
  } else {
    const pass = process.env.EEG_PASSPHRASE;
    if (!pass) throw new Error("Set EEG_PASSPHRASE to encrypt local data on this system.");
    const saltFile = path.join(dir, "key.salt");
    if (!fs.existsSync(saltFile)) fs.writeFileSync(saltFile, crypto.randomBytes(16).toString("hex"));
    cachedKey = crypto.scryptSync(pass, Buffer.from(fs.readFileSync(saltFile, "utf8").trim(), "hex"), 32);
  }
  if (cachedKey.length !== 32) throw new Error("The local encryption key is invalid.");
  return cachedKey;
}

function encrypt(plain, key = getKey()) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

const isEncrypted = (buf) => buf.length >= MAGIC.length + IV_LEN + TAG_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);

function decrypt(blob, key = getKey()) {
  if (!isEncrypted(blob)) throw new Error("Not an Earbud·EEG encrypted file.");
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = blob.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(blob.subarray(MAGIC.length + IV_LEN + TAG_LEN)), decipher.final()]);
  } catch {
    throw new Error("Encrypted file could not be opened: wrong key or the file was changed.");
  }
}

// Replace a plaintext file with `<file>.enc`; returns the new path.
function encryptFile(file) {
  if (!fs.existsSync(file)) return null;
  const out = `${file}.enc`;
  fs.writeFileSync(`${out}.tmp`, encrypt(fs.readFileSync(file)));
  fs.renameSync(`${out}.tmp`, out);
  fs.rmSync(file, { force: true });
  return out;
}

const decryptFile = (encFile) => decrypt(fs.readFileSync(encFile));

// Encrypt every plaintext file in `dir` matching `test` (one-time migration of older data).
function encryptAll(dir, test) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    if (test(name) && !name.endsWith(".enc")) {
      encryptFile(path.join(dir, name));
      n += 1;
    }
  }
  return n;
}

const _resetForTests = () => { cachedKey = null; };

module.exports = { encrypt, decrypt, isEncrypted, encryptFile, decryptFile, encryptAll, getKey, protector, _resetForTests, MAGIC };
