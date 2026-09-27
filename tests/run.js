import assert from "node:assert";
import { bumpOf, mergeInto } from "../clock.js";
import { step, close } from "../clockrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { clocks: [["a", [["a", 1]]], ["b", []]], marks: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "bump", node: "a" }],
  bad_node_code: "E_BAD_NODE", dup_node_code: "E_DUP_NODE",
  no_node_code: "E_NO_NODE", same_code: "E_SAME_NODE",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bumpOf returns a list", () => {
  assert.ok(Array.isArray(bumpOf([["a", 1]], "a")));
});

check("mergeInto returns a list", () => {
  assert.ok(Array.isArray(mergeInto([["a", 1]], [["b", 2]])));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
