import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const release = parse(readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"));
const prepare = parse(readFileSync(new URL("../.github/workflows/prepare-release.yml", import.meta.url), "utf8"));
const steps = release.jobs.build.steps;
const credentials = steps.find((step) => step.name === "Prepare macOS signing credentials");

function runCredentials(values = {}) {
  const root = mkdtempSync(join(tmpdir(), "release-config-"));
  try {
    const envPath = join(root, "github-env");
    const result = spawnSync("bash", ["-c", credentials.run], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: root, RUNNER_TEMP: root, GITHUB_ENV: envPath, ...values },
    });
    return { ...result, exports: result.status === 0 ? readFileSync(envPath, "utf8") : "" };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("macOS releases default to ad-hoc signing without Apple secrets", () => {
  const result = runCredentials();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.exports, /MACOS_SIGNING_MODE=adhoc/);
  assert.match(result.exports, /MACOS_SIGNING_IDENTITY=-/);
});

test("partial Apple credentials fail instead of silently downgrading", () => {
  const result = runCredentials({ APPLE_CERTIFICATE: "incomplete-certificate" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing repository secret: APPLE_CERTIFICATE_PASSWORD/);
});

test("complete Apple credentials retain Developer ID signing", () => {
  const result = runCredentials({
    APPLE_CERTIFICATE: "certificate", APPLE_CERTIFICATE_PASSWORD: "password",
    APPLE_SIGNING_IDENTITY: "Developer ID Application: Example (TEAM)",
    APPLE_API_ISSUER: "issuer", APPLE_API_KEY: "example",
    APPLE_API_KEY_BASE64: Buffer.from("-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n").toString("base64"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.exports, /MACOS_SIGNING_MODE=developer-id/);
});

test("app and standalone CLI have ad-hoc signature verification", () => {
  const bundle = steps.find((step) => step.name === "Verify macOS signature");
  const cli = steps.find((step) => step.name === "Ad-hoc sign macOS CLI binary");
  assert.ok(bundle && cli);
  assert.match(bundle.run, /Signature=adhoc/);
  assert.match(cli.run, /codesign --force --sign -/);
  assert.match(cli.run, /codesign --verify/);
  const build = steps.find((step) => step.name === "Build with Tauri");
  assert.match(build.with.args, /tauri\.adhoc\.conf\.json/);
  assert.match(build.env.TAURI_SIGNING_PRIVATE_KEY, /secrets\.TAURI_SIGNING_PRIVATE_KEY/);
});

test("Prepare Release explicitly dispatches the release tag with the built-in token", () => {
  assert.equal(prepare.permissions.actions, "write");
  const dispatch = prepare.jobs["prepare-release"].steps.find((step) => step.name === "Trigger release build");
  assert.ok(dispatch);
  assert.match(dispatch.run, /gh workflow run release\.yml/);
  assert.match(dispatch.run, /--ref "\$TAG"/);
  assert.match(dispatch.env.GH_TOKEN, /secrets\.GITHUB_TOKEN/);
});

test("updater points to this fork and uses its public key", () => {
  const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  assert.deepEqual(config.plugins.updater.endpoints, ["https://github.com/cute-angelia/skills-manager/releases/latest/download/latest.json"]);
  const payload = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8");
  assert.match(payload, /D8BFD1BCCC6346C5/);
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  const adhoc = JSON.parse(readFileSync(new URL("../src-tauri/tauri.adhoc.conf.json", import.meta.url), "utf8"));
  assert.equal(adhoc.bundle.macOS.signingIdentity, "-");
});

test("all bash workflow steps have valid shell syntax", () => {
  for (const workflow of [release, prepare]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.run || (step.shell && step.shell !== "bash")) continue;
        const result = spawnSync("bash", ["-n"], { input: step.run, encoding: "utf8" });
        assert.equal(result.status, 0, `${step.name}: ${result.stderr}`);
      }
    }
  }
});
