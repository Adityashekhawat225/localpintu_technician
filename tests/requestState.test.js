import test from "node:test";
import assert from "node:assert/strict";
import { clearRequestIfMatching, isRequestExpired, requestExpiryTime } from "../src/requestState.js";

test("finishing an older response never clears a newer incoming request", () => {
  const newer = { _id: "booking-2", customer: { name: "Second customer" } };
  assert.equal(clearRequestIfMatching(newer, "booking-1"), newer);
});

test("the matching request is cleared after accept, reject or timeout", () => {
  const current = { _id: "booking-1" };
  assert.equal(clearRequestIfMatching(current, "booking-1"), null);
});

test("an automatic request expires at its persisted deadline", () => {
  const request = { _id: "booking-1", technicianAssignmentStatus: "Requested", expiresAt: "2026-08-27T10:00:00.000Z" };
  assert.equal(requestExpiryTime(request), new Date(request.expiresAt).getTime());
  assert.equal(isRequestExpired(request, new Date("2026-08-27T10:00:01.000Z").getTime()), true);
});

test("a manual assignment popup expires without changing the booking itself", () => {
  const request = { _id: "booking-2", technicianAssignmentStatus: "Manual", uiExpiresAt: "2026-08-27T10:00:30.000Z" };
  assert.equal(requestExpiryTime(request), new Date(request.uiExpiresAt).getTime());
  assert.equal(isRequestExpired(request, new Date("2026-08-27T10:00:31.000Z").getTime()), true);
});
