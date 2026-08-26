import test from "node:test";
import assert from "node:assert/strict";
import { clearRequestIfMatching } from "../src/requestState.js";

test("finishing an older response never clears a newer incoming request", () => {
  const newer = { _id: "booking-2", customer: { name: "Second customer" } };
  assert.equal(clearRequestIfMatching(newer, "booking-1"), newer);
});

test("the matching request is cleared after accept, reject or timeout", () => {
  const current = { _id: "booking-1" };
  assert.equal(clearRequestIfMatching(current, "booking-1"), null);
});
