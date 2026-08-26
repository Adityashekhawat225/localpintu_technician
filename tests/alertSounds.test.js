import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_SOUND_PRESETS, getAlertPattern } from "../src/alertSounds.js";

test("all administrator sound presets contain playable tone steps", () => {
  assert.equal(Object.keys(ALERT_SOUND_PRESETS).length, 4);
  Object.values(ALERT_SOUND_PRESETS).forEach((pattern) => {
    assert.ok(pattern.length >= 3);
    pattern.forEach(([frequency, offset, duration]) => assert.ok(frequency > 0 && offset >= 0 && duration > 0));
  });
});

test("unknown sound safely falls back to classic bell", () => {
  assert.equal(getAlertPattern("unknown"), ALERT_SOUND_PRESETS["classic-bell"]);
});
