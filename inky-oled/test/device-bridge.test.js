/* The Device widget and the Android bridge behind it.

   This is the JS half of the contract with MainActivity's @JavascriptInterface object. It
   cannot exercise the Java, but it does pin the shape and the degradation behaviour, so a
   change on the shell side that drops a field shows up here rather than as "n/a" on a wall.
   The WebView hardening in MainActivity (navigation allowlist, debug socket gating) must
   leave every one of these passing. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");
var fake = require("./lib/fake-bridge.js");

/* Storage and Memory both have a "Free" and a "Total", so stats are read per section. */
function stats(body, sectionTitle) {
  var root = body;
  if (sectionTitle) {
    root = body.querySelectorAll(".psec").filter(function (s) {
      return s.querySelector(".psec-t").textContent === sectionTitle;
    })[0];
    assert.ok(root, "no section titled " + sectionTitle);
  }
  var out = {};
  root.querySelectorAll(".stat").forEach(function (st) {
    out[st.querySelector(".stat-k").textContent] = st.querySelector(".stat-v").textContent;
  });
  return out;
}

test("the tile reports real battery, storage, uptime and network", function () {
  var app = h.createApp({ bridge: fake.make({}) });
  assert.equal(app.text("sys-big"), "74%");
  assert.equal(app.text("sys-sub"), "41 GB · 3d up · Wi-Fi");
});

test("charging adds the bolt", function () {
  var app = h.createApp({ bridge: fake.make({ charging: true }) });
  assert.equal(app.text("sys-big"), "74% ↯");
});

test("the panel renders every section from one snapshot", function () {
  /* CHANGED with the copy sweep. Four battery cells, "Low memory", "Used %" x2, the
     network interface name and "(API 33)" were removed as jargon or as restatements of
     something already on the screen — see the comments in wx-system.js. Every field that
     went is still asserted here, against the element that now carries it, so this test
     still proves the whole snapshot reaches the panel and not only the part of it that
     survived a layout change. */
  var app = h.createApp({ bridge: fake.make({}) });
  app.tap(app.qs('[data-open="system"]'));
  var body = app.panelBody("system");

  /* level and status live in the hero, which is where they always visually were */
  assert.equal(body.querySelector(".big-time").textContent, "74%");
  assert.equal(body.querySelector(".big-sub").textContent, "Discharging");

  var bat = stats(body, "Battery");
  assert.equal(bat["Health"], "Good");
  assert.equal(bat["Voltage"], "4.102 V");
  assert.equal(bat["Temperature"], "83.1 °F");
  assert.equal(bat["Cells"], "Li-ion");
  assert.deepEqual(Object.keys(bat).filter(function (k) {
    return k === "Level" || k === "Charging" || k === "Status";
  }), [], "the battery grid is restating the hero again");

  var st = stats(body, "Storage");
  assert.equal(st["Free"], "41 GB");
  assert.equal(st["Total"], "128 GB");
  assert.equal(st["Used"], "87 GB");

  var mem = stats(body, "Memory");
  assert.equal(mem["Free"], "2 GB");
  assert.equal(mem["Total"], "6 GB");
  assert.equal(mem["Used"], "4 GB");

  var net = stats(body, "Network");
  assert.equal(net["Transport"], "Wi-Fi");
  assert.equal(net["Internet"], "Working");
  assert.equal(net["Metered"], "No");
  assert.equal(net["Down"], "144 Mbps");

  var dev = stats(body, "Uptime & device");
  assert.equal(dev["Uptime"], "3d 4h 0m");
  assert.equal(dev["Awake"], "2d 0h 0m");
  assert.equal(dev["Tablet"], "testco TEST-PANEL", "manufacturer and model, one answer");
  assert.equal(dev["Android"], "13");
  assert.equal(dev["Screen"], "1600x2560 pixels");
  assert.equal(dev["Brightness"], "50%");
  assert.match(app.qs('[data-panel="system"] [data-sub]').textContent, /TEST-PANEL · Android 13/);
});

test("battery temperature follows the unit setting", function () {
  var app = h.createApp({ bridge: fake.make({}) });
  app.WP.settings.set("units", "celsius");
  app.WP.panels.open("system");
  assert.equal(stats(app.panelBody("system"))["Temperature"], "28.4 °C");
});

test("storage and memory percentages come out of the snapshot's own numbers", function () {
  var app = h.createApp({
    bridge: fake.make({ storage: { total: 100, free: 25 }, memory: { total: 8, free: 2 } })
  });
  app.WP.panels.open("system");
  var body = app.panelBody("system");
  var s = stats(body, "Storage");
  assert.equal(s["Used"], "75 B");

  /* CHANGED with the copy sweep: the percentage used to be a "Used %" cell, which was the
     fourth cell of a three-across grid and so sat alone on the row the footer cut in half.
     It was also the bar directly above it, written out. Assert the BAR now — both the
     width it is drawn at and the percentage it announces — which is a strictly better
     check, because the bar is the thing on the screen and the cell never was. */
  function pct(label) {
    var b = body.querySelectorAll(".bar").filter(function (n) {
      return (n.getAttribute("aria-label") || "").indexOf(label) === 0;
    })[0];
    assert.ok(b, "no " + label + " bar");
    return { width: b.querySelector(".bar-fill").getAttribute("style"),
             said: b.getAttribute("aria-label") };
  }
  assert.equal(pct("storage used").width, "width:75.0%");
  assert.equal(pct("storage used").said, "storage used 75 percent");
  assert.equal(pct("memory used").width, "width:75.0%");
  assert.equal(pct("memory used").said, "memory used 75 percent");
});

test("no bridge at all degrades to an explicit message, not a blank card", function () {
  var app = h.createApp({});                       // window.Android absent
  assert.equal(app.text("sys-big"), "n/a");
  assert.equal(app.text("sys-sub"), "no device link");
  assert.equal(app.WP.bridge.present(), false);

  app.WP.panels.open("system");
  assert.match(app.panelBody("system").textContent, /link is not available/);
  assert.match(app.qs('[data-panel="system"] [data-sub]').textContent, /sensors unavailable/);
  assert.deepEqual(app.logs.error, []);
});

test("a bridge that returns junk is treated as absent, not as a crash", function () {
  var app = h.createApp({ bridge: fake.make({ broken: true }) });
  assert.equal(app.text("sys-big"), "n/a");
  assert.equal(app.text("sys-sub"), "sensor error", "a present-but-broken bridge says so");
  assert.deepEqual(app.logs.error, []);
});

test("a bridge that throws is caught and logged, not propagated", function () {
  var app = h.createApp({
    bridge: { deviceInfo: function () { throw new Error("JNI exploded"); } }
  });
  assert.equal(app.text("sys-big"), "n/a");
  assert.deepEqual(app.logs.error, []);
  assert.match(app.logs.warn.join(" "), /bridge deviceInfo failed/);
});

test("bridge.has and bridge.call answer honestly about missing methods", function () {
  var app = h.createApp({ bridge: { deviceInfo: function () { return "{}"; } } });
  var b = app.WP.bridge;
  assert.equal(b.present(), true);
  assert.equal(b.has("deviceInfo"), true);
  assert.equal(b.has("setPref"), false, "a method the shell does not expose");
  assert.equal(b.call("setPref", "x"), null, "calling a missing method must return null");
  assert.equal(b.json("nope"), null);
});

test("a partial snapshot renders what it has and dashes the rest", function () {
  var app = h.createApp({
    bridge: { deviceInfo: function () { return JSON.stringify({ uptimeMs: 5000 }); } }
  });
  assert.equal(app.text("sys-big"), "--%");
  assert.equal(app.text("sys-sub"), "-- · 5s up · offline");
  app.WP.panels.open("system");
  var body = app.panelBody("system");
  /* CHANGED with the copy sweep: level moved to the hero and Model/Manufacturer merged
     into one "Tablet" cell. Same assertion — a missing field must dash, never print
     "undefined" or vanish — against the elements that carry it now. */
  assert.equal(body.querySelector(".big-time").textContent, "--%");
  var s = stats(body);
  assert.equal(s["Tablet"], "--");
  assert.equal(s["Transport"], "none");
  assert.equal(/undefined|NaN|null/.test(body.textContent), false,
    "a missing field leaked a JS value onto the wall");
  assert.deepEqual(app.logs.error, []);
});

function jni(bridge) {
  return bridge.calls.filter(function (c) { return c === "deviceInfo"; }).length;
}

test("the widget re-reads the bridge on its refresh cadence", function () {
  var bridge = fake.make({});
  var app = h.createApp({ bridge: bridge });
  var first = jni(bridge);
  app.advance(11 * 60000);
  assert.ok(jni(bridge) > first, "the Device widget stopped polling the bridge");
});

/* ---------------- poll cadence ----------------
   The bridge poll is the app's only JNI traffic and it used to run at 5 s forever, panel
   open or closed: ~17,300 crossings a day plus a full tile re-render on each one, to keep a
   battery percentage and a rounded uptime current. These three tests pin the replacement —
   the cadence, the fact that opening the panel does not have to wait for it, and the fact
   that the tile is still live with the panel closed. */

test("with the Device panel closed the bridge is polled once a minute, not every 5 s", function () {
  var bridge = fake.make({});
  var app = h.createApp({ bridge: bridge });
  var atBoot = jni(bridge);
  assert.equal(atBoot, 1, "boot should take exactly one reading");

  app.advance(3600000);                          // one hour, panel closed
  var perHour = jni(bridge) - atBoot;
  assert.equal(perHour, 60, "expected 60 polls an hour with the panel closed, got " + perHour);
  /* the old cadence would be 720; state the comparison so the number cannot rot silently */
  assert.ok(perHour < 720 / 6, "the idle backoff is not actually backing off");
});

test("opening the Device panel restores the 5 s cadence and reads immediately", function () {
  var bridge = fake.make({});
  var app = h.createApp({ bridge: bridge });
  app.advance(30000);                            // mid-way through an idle period
  var before = jni(bridge);

  app.WP.panels.open("system");
  assert.equal(jni(bridge), before + 1,
    "opening the panel must take a reading, not show a up-to-a-minute-old one");

  app.advance(60000);                            // a minute with the panel open
  var open = jni(bridge) - (before + 1);
  assert.equal(open, 12, "expected 12 polls a minute with the panel open, got " + open);

  app.WP.panels.closeAll();
  var afterClose = jni(bridge);
  app.advance(30000);
  assert.equal(jni(bridge), afterClose, "the 5 s cadence outlived the panel that needed it");
});

test("a live battery change still reaches the closed tile by itself", function () {
  var bridge = fake.make({});
  var app = h.createApp({ bridge: bridge });
  assert.equal(app.text("sys-big"), "74%");
  bridge.snapshot.battery.level = 12;
  bridge.snapshot.battery.charging = true;
  app.advance(61000);                            // one idle period
  assert.equal(app.text("sys-big"), "12% ↯", "the tile stopped updating on its own");
});

test("an unchanged snapshot writes nothing to the tile", function () {
  /* Backing off the poll is only half of it: the poll that does happen re-rendered the tile
     whether or not anything had moved. */
  var bridge = fake.make({});
  var app = h.createApp({ bridge: bridge });
  var big = app.$("sys-big"), sub = app.$("sys-sub");
  var proto = Object.getPrototypeOf(big);
  var desc = Object.getOwnPropertyDescriptor(proto, "textContent");
  var writes = 0;
  [big, sub].forEach(function (el) {
    Object.defineProperty(el, "textContent", {
      configurable: true,
      get: function () { return desc.get.call(this); },
      set: function (v) { writes++; desc.set.call(this, v); }
    });
  });

  app.advance(3600000);                          // an hour of polls, nothing changing
  assert.equal(writes, 0, "an unchanged device snapshot rewrote the tile " + writes + " times");

  bridge.snapshot.battery.level = 73;
  app.advance(61000);
  assert.equal(writes, 1, "a real change did not reach the tile (or wrote more than it needed)");
});

test("the Settings panel reports whether the bridge is attached", function () {
  /* CHANGED with the copy sweep: the About block said "device sensors: connected · screen
     711 × 1138". The screen figure was the CSS viewport rather than the screen and was
     jargon either way; the rest is now a sentence. Same fact, still asserted both ways
     round, and the viewport figure is asserted GONE so it cannot come back. */
  var withBridge = h.createApp({ bridge: fake.make({}) });
  withBridge.WP.panels.open("settings");
  var on = withBridge.panelBody("settings").textContent;
  assert.match(on, /battery and storage are being read/);
  assert.equal(/\d+ ?[×x] ?\d+/.test(on), false, "the viewport measurement is back");

  var without = h.createApp({});
  without.WP.panels.open("settings");
  assert.match(without.panelBody("settings").textContent,
    /battery and storage are not readable right now/);
});
