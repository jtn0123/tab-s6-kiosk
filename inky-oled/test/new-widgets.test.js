/* Moon phase, air quality and calendar — the three local/keyless widgets, plus the sky
   layer's code->scene mapping. Everything here is the pure arithmetic those widgets are
   built on; the rendering paths are covered by the panel and design-system suites. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");

var app = h.createApp({});
var moon = app.registry.moon;
var air = app.registry.air;
var cal = app.registry.calendar;
var sky = app.registry.sky;

/* ---------------- moon ---------------- */

var EPOCH = 947182440000;                 // 2000-01-06 18:14 UTC, a known new moon
var SYN_MS = 29.530588853 * 86400000;

test("the epoch new moon computes as new", function () {
  var m = moon.calc(EPOCH);
  assert.equal(m.name, "New moon");
  assert.ok(m.frac < 0.02, "illumination at a new moon: " + m.frac);
});

test("half a cycle after new is full, a quarter is half-lit", function () {
  var full = moon.calc(EPOCH + SYN_MS / 2);
  assert.equal(full.name, "Full moon");
  assert.ok(full.frac > 0.98, "full moon frac: " + full.frac);

  var q1 = moon.calc(EPOCH + SYN_MS / 4);
  assert.equal(q1.name, "First quarter");
  assert.ok(Math.abs(q1.frac - 0.5) < 0.03, "first quarter frac: " + q1.frac);

  var q3 = moon.calc(EPOCH + SYN_MS * 0.75);
  assert.equal(q3.name, "Last quarter");
});

test("next full and next new are always ahead, never more than a cycle out", function () {
  [0, 0.2, 0.5, 0.8, 0.99].forEach(function (p) {
    var ms = EPOCH + 300 * SYN_MS + p * SYN_MS;   // some arbitrary cycle
    var m = moon.calc(ms);
    assert.ok(m.nextFull > ms, "nextFull in the past at p=" + p);
    assert.ok(m.nextNew > ms, "nextNew in the past at p=" + p);
    assert.ok(m.nextFull - ms <= SYN_MS + 1, "nextFull more than a cycle out at p=" + p);
    assert.ok(m.nextNew - ms <= SYN_MS + 1, "nextNew more than a cycle out at p=" + p);
  });
});

test("a date before the epoch still lands in [0, 1)", function () {
  var m = moon.calc(EPOCH - 3.7 * 86400000);
  assert.ok(m.p >= 0 && m.p < 1, "phase " + m.p);
  assert.ok(m.age >= 0, "age " + m.age);
});

/* ---------------- air quality bands ----------------
   The EPA breakpoints. An off-by-one here puts the wrong colour on a health scale, so
   every boundary is pinned on both sides. */

test("the AQI bands break exactly at the EPA breakpoints", function () {
  [[0, "Good"], [50, "Good"], [51, "Moderate"], [100, "Moderate"],
   [101, "Unhealthy for sensitive groups"], [150, "Unhealthy for sensitive groups"],
   [151, "Unhealthy"], [200, "Unhealthy"],
   [201, "Very unhealthy"], [300, "Very unhealthy"],
   [301, "Hazardous"], [500, "Hazardous"]
  ].forEach(function (want) {
    assert.equal(air.band(want[0]).label, want[1], "AQI " + want[0]);
  });
});

test("every band wears its own colour class and junk degrades to unknown", function () {
  var seen = {};
  [10, 75, 125, 175, 250, 400].forEach(function (v) {
    var b = air.band(v);
    assert.match(b.cls, /^band-/);
    assert.equal(seen[b.cls], undefined, b.cls + " reused across bands");
    seen[b.cls] = true;
  });
  assert.equal(air.band(null).label, "Unknown");
  assert.equal(air.band(NaN).cls, "band-na");
});

/* ---------------- calendar ---------------- */

test("august 2026 starts on a saturday and carries 31 days", function () {
  var weeks = cal.monthGrid(2026, 7);
  assert.equal(weeks[0].filter(function (c) { return !c.in; }).length, 6,
    "aug 1 2026 is a saturday: six lead-in cells");
  var inMonth = [];
  weeks.forEach(function (w) {
    assert.equal(w.length, 7, "a week is seven cells");
    w.forEach(function (c) { if (c.in) inMonth.push(c.d); });
  });
  assert.equal(inMonth.length, 31);
  assert.equal(inMonth[0], 1);
  assert.equal(inMonth[30], 31);
});

test("february keeps leap years straight", function () {
  var leap = [];
  cal.monthGrid(2024, 1).forEach(function (w) {
    w.forEach(function (c) { if (c.in) leap.push(c.d); });
  });
  assert.equal(leap.length, 29, "2024 is a leap year");

  /* feb 2026 starts on a sunday and has 28 days: exactly four full weeks, no filler */
  var weeks = cal.monthGrid(2026, 1);
  assert.equal(weeks.length, 4);
  weeks.forEach(function (w) {
    w.forEach(function (c) { assert.equal(c.in, true, "feb 2026 needs no out-of-month cells"); });
  });
});

test("lead-in and trailing cells carry the neighbours' real day numbers", function () {
  var weeks = cal.monthGrid(2026, 7);          // august 2026
  assert.equal(weeks[0][0].d, 26, "the first cell is july 26");
  var last = weeks[weeks.length - 1];
  assert.equal(last[6].d, 5, "the last cell is september 5");
});

/* ---------------- sky scenes ---------------- */

test("every documented WMO code lands in the scene its icon promises", function () {
  var want = {
    0: "clear", 1: "clear", 2: "partly", 3: "cloudy",
    45: "fog", 48: "fog",
    51: "drizzle", 53: "drizzle", 55: "drizzle", 56: "drizzle", 57: "drizzle",
    61: "rain", 63: "rain", 65: "rain", 66: "rain", 67: "rain",
    71: "snow", 73: "snow", 75: "snow", 77: "snow", 85: "snow", 86: "snow",
    80: "rain", 81: "rain",
    82: "storm", 95: "storm", 96: "storm", 99: "storm"
  };
  Object.keys(want).forEach(function (c) {
    assert.equal(sky.sceneFor(Number(c)), want[c], "WMO " + c);
  });
  assert.equal(sky.sceneFor(1234), "clear", "unknown codes degrade to the quiet scene");
});

test("the sky honours its settings switch, and ships OFF", function () {
  /* It shipped on. The scene drew its specks inside the cards as well as behind them, and
     at 2-4 m a scatter of dim dots on a black panel reads as dust on the glass or as dead
     pixels rather than as weather — on a display where a dead pixel is a thing that
     actually happens — while animating 24/7 on a panel whose rule is that lit pixels are
     data. The default is the decision; the switch is still there for anyone who wants it. */
  var a = h.createApp({});
  assert.equal(a.WP.settings.get("sky"), false, "sky ships on");
  a.WP.panels.open("settings");
  var row = a.qs('[data-panel="settings"] [data-act="sky"]');
  assert.ok(row, "settings offers no sky switch");
  assert.equal(row.getAttribute("aria-checked"), "false");
  a.tap(row);
  assert.equal(a.WP.settings.get("sky"), true, "the switch does not persist the setting");
});

/* ---------------- the home tiles ---------------- */

test("the moon and calendar tiles paint from local arithmetic at boot", function () {
  var a = h.createApp({});
  assert.match(a.text("moon-big"), /\d+%/, "moon tile shows no illumination");
  assert.ok(a.text("moon-sub").length > 3, "moon tile names no phase");
  assert.match(a.text("cal-big"), /^\d{1,2}$/, "calendar tile shows no day number");
  assert.match(a.text("cal-sub"), /\w+ · \w+/, "calendar tile names no weekday/month");
});

test("the air tile renders a banded reading once data lands", function () {
  var a = h.createApp({});
  var wx = require("./lib/wx-fixture.js");
  a.registry.air.data = wx.aqi({ now: a.clock.now, us_aqi: 42 });
  a.registry.air.stale = false;
  a.registry.air.render();
  assert.equal(a.text("air-big"), "42");
  assert.match(a.qs("#air-big span").getAttribute("class"), /band-1/);
  assert.match(a.text("air-sub"), /Good/);
});
