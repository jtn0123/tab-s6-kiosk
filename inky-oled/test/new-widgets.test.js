/* Moon phase and air quality — the two local/keyless widgets, plus the sky
   layer's code->scene mapping. Everything here is the pure arithmetic those widgets are
   built on; the rendering paths are covered by the panel and design-system suites. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");

var app = h.createApp({});
var moon = app.registry.moon;
var air = app.registry.air;
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

test("a pollutant sitting exactly ON its guideline is not drawn as unremarkable", function () {
  /* The defect this replaces, stated as the number that produced it: the pollutant grid
     compared with a strict `n > guideline`, so `PM2.5 15` against a WHO guideline of 15 —
     a reading at 100% of the published limit — rendered in the same plain white as one at
     3% of it, and a reading at 5x looked identical to one at 1.01x. Six white numbers, on
     the one screen in the build whose subject is a health scale.

     Both edges of every step are pinned, for the same reason the EPA breakpoints above
     are: a boundary that moves by one puts the wrong colour on a health figure. */
  assert.equal(air.ratioBand(0), "band-1");
  assert.equal(air.ratioBand(0.49), "band-1");
  assert.equal(air.ratioBand(0.5), "band-2", "half the guideline should read as approaching");
  assert.equal(air.ratioBand(1), "band-2", "AT the guideline is not the same as under it");
  assert.equal(air.ratioBand(1.01), "band-3", "a hair over the guideline is over it");
  assert.equal(air.ratioBand(2), "band-3");
  assert.equal(air.ratioBand(2.01), "band-4");
  assert.equal(air.ratioBand(9), "band-4");

  /* and the four steps are four different colours, or the ratio is not being encoded */
  var seen = {};
  [0.1, 0.8, 1.5, 4].forEach(function (r) {
    var c = air.ratioBand(r);
    assert.equal(seen[c], undefined, c + " is reused across two ratio steps");
    seen[c] = true;
  });
});

test("the Air panel names which pollutant is nearest its guideline", function () {
  /* The panel's one sentence of explanation. Everything else on the screen restates the
     61: the tile says it, the hero says it, the chart plots it. This says why. */
  assert.match(air.nearestLimit({ pm2_5: 15, pm10: 18, ozone: 20 }),
    /^PM2\.5 is nearest its guideline, at 100%$/);
  assert.match(air.nearestLimit({ pm2_5: 3, ozone: 80 }),
    /^ozone is nearest its guideline, at 80%$/);
  /* Above the guideline it says BY HOW MUCH. It used to print the same six words —
     "is over its guideline" — at 1.1x and at 4.3x, so the sentence got vaguer exactly as
     the air got worse; found by forcing a hazardous reading in the simulator, which is
     the only way that state is ever reachable on a desk. */
  assert.equal(air.nearestLimit({ pm2_5: 30 }), "PM2.5 is 2× its guideline");
  assert.equal(air.nearestLimit({ ozone: 192 }), "ozone is 1.9× its guideline");
  assert.equal(air.nearestLimit({ ozone: 434 }), "ozone is 4.3× its guideline");
  /* past 10x the tenth is noise, and the number is already the whole message */
  assert.equal(air.nearestLimit({ pm2_5: 900 }), "PM2.5 is 60× its guideline");
  assert.equal(air.nearestLimit({}), "", "no readings must not invent a sentence");
});

/* The calendar's month-grid arithmetic used to be tested here — first-weekday offset, leap
   years, the 4/5/6-row months. The widget is gone (see the WIDGETS note in app.js: a month
   grid with no events, on a wall panel, for three design rounds), and so are its tests.
   Deleting a screen means deleting the assertions that kept it honest, not leaving them to
   pass against nothing. */

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

test("the moon tile paints from local arithmetic at boot", function () {
  var a = h.createApp({});
  assert.match(a.text("moon-big"), /\d+%/, "moon tile shows no illumination");
  assert.ok(a.text("moon-sub").length > 3, "moon tile names no phase");
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
