import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isInNightWindow,
  nextFixedTransition,
  parseHHmm,
  isNightBySun,
  nextSunTransition,
  lerp,
} from "../src/lib/scheduleMath.js";

describe("parseHHmm", () => {
  it("parses 21:00", () => {
    assert.deepEqual(parseHHmm("21:00"), { h: 21, m: 0 });
  });
  it("rejects 24:00", () => {
    assert.equal(parseHHmm("24:00"), null);
  });
});

describe("isInNightWindow overnight", () => {
  it("is on at 22:00 for 21:00-07:00", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T22:00:00"), "21:00", "07:00"), true);
  });
  it("is on at 02:00 for 21:00-07:00", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T02:00:00"), "21:00", "07:00"), true);
  });
  it("is off at 12:00 for 21:00-07:00", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T12:00:00"), "21:00", "07:00"), false);
  });
  it("is off at 07:00 (end exclusive)", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T07:00:00"), "21:00", "07:00"), false);
  });
  it("same start and end is never on", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T21:00:00"), "21:00", "21:00"), false);
  });
});

describe("isInNightWindow same-day", () => {
  it("is on at 10:00 for 09:00-17:00", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T10:00:00"), "09:00", "17:00"), true);
  });
  it("is off at 18:00 for 09:00-17:00", () => {
    assert.equal(isInNightWindow(new Date("2026-01-15T18:00:00"), "09:00", "17:00"), false);
  });
});

describe("nextFixedTransition", () => {
  it("picks tonight's start in the afternoon", () => {
    const next = nextFixedTransition(
      new Date("2026-01-15T15:00:00"),
      "21:00",
      "07:00"
    );
    assert.ok(next);
    assert.equal(next!.getHours(), 21);
    assert.equal(next!.getDate(), 15);
  });
  it("picks morning end after 21:00", () => {
    const next = nextFixedTransition(
      new Date("2026-01-15T22:00:00"),
      "21:00",
      "07:00"
    );
    assert.ok(next);
    assert.equal(next!.getHours(), 7);
    assert.equal(next!.getDate(), 16);
  });
});

describe("sun helpers", () => {
  it("is night after sunset", () => {
    const sunrise = new Date("2026-01-15T07:30:00");
    const sunset = new Date("2026-01-15T17:00:00");
    assert.equal(
      isNightBySun(new Date("2026-01-15T20:00:00"), { sunrise, sunset }),
      true
    );
    assert.equal(
      isNightBySun(new Date("2026-01-15T12:00:00"), { sunrise, sunset }),
      false
    );
  });
  it("next sun event is the next future sunrise/sunset", () => {
    const today = {
      sunrise: new Date("2026-01-15T07:30:00"),
      sunset: new Date("2026-01-15T17:00:00"),
    };
    const tomorrow = {
      sunrise: new Date("2026-01-16T07:31:00"),
      sunset: new Date("2026-01-16T17:01:00"),
    };
    const next = nextSunTransition(
      new Date("2026-01-15T12:00:00"),
      today,
      tomorrow
    );
    assert.ok(next);
    assert.equal(next!.getHours(), 17);
  });
});

describe("lerp", () => {
  it("interpolates", () => {
    assert.equal(lerp(0, 10, 0.5), 5);
  });
});
