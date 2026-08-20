import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coverageRatio,
  isBorderlessStyle,
  isExclusiveIsh,
  isFullscreenCover,
  QUNS,
  WS_CAPTION,
} from "../src/lib/fullscreenMath.js";

const display = { left: 0, top: 0, right: 1920, bottom: 1080 };

describe("coverage", () => {
  it("covers a matching window", () => {
    assert.ok(isFullscreenCover({ left: 0, top: 0, right: 1920, bottom: 1080 }, display));
  });
  it("rejects a small window", () => {
    assert.equal(
      isFullscreenCover({ left: 100, top: 100, right: 500, bottom: 400 }, display),
      false
    );
    assert.ok(coverageRatio({ left: 100, top: 100, right: 500, bottom: 400 }, display) < 0.2);
  });
});

describe("style / QUNS", () => {
  it("caption means not borderless", () => {
    assert.equal(isBorderlessStyle(WS_CAPTION | 0x10000000), false);
    assert.equal(isBorderlessStyle(0x10000000), true);
  });
  it("treats BUSY and D3D as exclusive-ish", () => {
    assert.equal(isExclusiveIsh(QUNS.BUSY), true);
    assert.equal(isExclusiveIsh(QUNS.RUNNING_D3D_FULL_SCREEN), true);
    assert.equal(isExclusiveIsh(QUNS.ACCEPTS_NOTIFICATIONS), false);
  });
});
