const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eegsec-"));
process.env.DATA_DIR = tmp;
delete process.env.EEG_TEST_KEY;
const secure = require("./secure");

// Stand-in for DPAPI so the test does not depend on the Windows account.
const WRAP = Buffer.from("wrapped:");
secure.protector = {
  protect: (k) => Buffer.concat([WRAP, k]),
  unprotect: (b) => b.subarray(WRAP.length),
};
if (process.platform !== "win32") process.env.EEG_PASSPHRASE = "test passphrase";

test("round trip keeps the bytes", () => {
  const plain = Buffer.from("Saksham · peak alpha 10.3 Hz");
  const blob = secure.encrypt(plain);
  assert.ok(secure.isEncrypted(blob));
  assert.ok(!blob.includes(Buffer.from("Saksham")));
  assert.deepEqual(secure.decrypt(blob), plain);
});

test("a changed byte is detected", () => {
  const blob = secure.encrypt(Buffer.from("seizure screen result"));
  blob[blob.length - 1] ^= 0xff;
  assert.throws(() => secure.decrypt(blob), /wrong key or the file was changed/);
});

test("a different key cannot open it", () => {
  const blob = secure.encrypt(Buffer.from("health data"));
  assert.throws(() => secure.decrypt(blob, Buffer.alloc(32, 7)), /wrong key/);
});

test("the key is created once and reused", () => {
  const a = secure.getKey();
  secure._resetForTests();
  const b = secure.getKey();
  assert.deepEqual(a, b);
  if (process.platform === "win32") assert.ok(fs.existsSync(path.join(tmp, "key.dpapi")));
});

test("encryptFile replaces the plaintext file", () => {
  const f = path.join(tmp, "rec.edf");
  fs.writeFileSync(f, "0       EDF HEADER");
  const out = secure.encryptFile(f);
  assert.equal(out, f + ".enc");
  assert.ok(!fs.existsSync(f));
  assert.equal(secure.decryptFile(out).toString(), "0       EDF HEADER");
});

test("store migrates plaintext store.json to store.enc", () => {
  fs.writeFileSync(path.join(tmp, "store.json"), JSON.stringify({ participants: [{ id: "p1", nickname: "Test" }], sessions: [], events: [] }));
  const store = require("./store");
  const db = store.load();
  assert.equal(db.participants[0].nickname, "Test");
  assert.ok(Array.isArray(db.habits) && Array.isArray(db.alerts) && Array.isArray(db.monitoring));
  assert.ok(!fs.existsSync(path.join(tmp, "store.json")));
  assert.ok(!fs.readFileSync(store.FILE).includes(Buffer.from("Test")));
});
