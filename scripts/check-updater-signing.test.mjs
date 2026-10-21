import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { checkUpdaterSigning } from "./check-updater-signing.mjs";

let root;
let privateKey;
let publicKey;
const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));

before(() => {
  root = mkdtempSync(join(tmpdir(), "updater-keys-test-"));
  const path = join(root, "test.key");
  const result = spawnSync(process.execPath, [cli, "signer", "generate", "--ci", "-p", "", "-w", path], { encoding: "utf8" });
  assert.equal(result.status, 0, "Could not generate a temporary test key");
  privateKey = readFileSync(path, "utf8").trim();
  publicKey = readFileSync(`${path}.pub`, "utf8").trim();
});
after(() => { if (root) rmSync(root, { recursive: true, force: true }); });

test("new empty-password keys can sign and verify updates", () => {
  assert.doesNotThrow(() => checkUpdaterSigning({ privateKey, publicKey, password: "" }));
});

test("a different public key is rejected", () => {
  const decoded = Buffer.from(publicKey, "base64").toString("utf8").trim().split("\n");
  const bytes = Buffer.from(decoded[1], "base64");
  bytes[bytes.length - 1] ^= 1;
  decoded[1] = bytes.toString("base64");
  const differentKey = Buffer.from(decoded.join("\n")).toString("base64");
  assert.throws(() => checkUpdaterSigning({ privateKey, publicKey: differentKey, password: "" }), /does not match/);
});

test("missing keys and wrong passwords fail without exposing the private key", () => {
  assert.throws(() => checkUpdaterSigning({ privateKey: "", publicKey }), /TAURI_SIGNING_PRIVATE_KEY is missing/);
  const error = assert.throws;
  error(() => checkUpdaterSigning({ privateKey, publicKey, password: "wrong-password" }), (cause) => {
    assert.ok(!cause.message.includes(privateKey));
    return /Unable to sign/.test(cause.message);
  });
});
