import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Percentage heights in auto-sized grid rows collapse in older WebKit.
for (const view of ["MySkills", "WorkspaceView", "ProjectDetail"]) {
  test(`${view} skill cards do not depend on percentage heights`, async () => {
    const source = await readFile(new URL(`../src/views/${view}.tsx`, import.meta.url), "utf8");
    assert.ok(!/\bh-full\b/.test(source), "Use grid stretch or flex growth instead of h-full");
  });
}

test("sortable skill wrappers stretch their cards without percentage heights", async () => {
  const source = await readFile(new URL("../src/views/MySkills.tsx", import.meta.url), "utf8");
  assert.ok(/className=\{cn\("flex min-w-0 flex-col", className\)\}/.test(source));
  assert.ok(/app-panel group relative flex flex-1 cursor-pointer flex-col/.test(source));
});
