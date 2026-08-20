import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrate, defaults } from "../src/lib/settingsMigrate.js";

describe("migrate", () => {
  it("fills 0.3.x prefs with new keys", () => {
    const s = migrate({
      enabled: false,
      warmth: 70,
      dim: 10,
      autolaunch: true,
    });
    assert.equal(s.enabled, false);
    assert.equal(s.warmth, 70);
    assert.equal(s.dim, 10);
    assert.equal(s.autolaunch, true);
    assert.equal(s.fullscreenBehavior, "hide");
    assert.equal(s.updateChannel, "stable");
    assert.equal(s.hotkeys.toggle, defaults.hotkeys.toggle);
    assert.equal(s.schedule.mode, "fixed");
  });

  it("clamps warmth/dim", () => {
    const s = migrate({ warmth: 500, dim: -20 });
    assert.equal(s.warmth, 100);
    assert.equal(s.dim, 0);
  });

  it("keeps a valid fullscreen behavior", () => {
    const s = migrate({ fullscreenBehavior: "always-on-top" });
    assert.equal(s.fullscreenBehavior, "always-on-top");
  });

  it("preserves stored ask behavior", () => {
    const s = migrate({ fullscreenBehavior: "ask" });
    assert.equal(s.fullscreenBehavior, "ask");
  });
});
