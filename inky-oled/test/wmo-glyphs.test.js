/* WMO code -> icon + words, and the monochrome-glyph rule the whole panel depends on. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");

var app = h.createApp({});
var wmo = app.WP.wmo;

test("clear sky swaps sun for moon at night", function () {
  assert.equal(wmo(0, false).icon, "☀");
  assert.equal(wmo(0, true).icon, "☽");
  assert.equal(wmo(0, false).text, "Clear");
  assert.equal(wmo(0, true).text, "Clear", "the words do not change with day/night");
  assert.equal(wmo(1, true).icon, "☽");
});

test("partly cloudy is the other day/night variant", function () {
  assert.notEqual(wmo(2, false).icon, wmo(2, true).icon);
  assert.equal(wmo(2, true).icon, "☁");
  assert.equal(wmo(2, false).text, "Partly cloudy");
});

test("codes with no day/night difference return the same glyph either way", function () {
  [3, 45, 48, 51, 61, 65, 71, 75, 80, 95, 99].forEach(function (code) {
    assert.equal(wmo(code, false).icon, wmo(code, true).icon, "code " + code);
  });
});

test("unknown codes degrade to a dot, never to undefined", function () {
  [null, undefined, -1, 4, 7, 100, 999, "banana"].forEach(function (code) {
    var r = wmo(code, false);
    assert.equal(r.icon, "·", "code " + code);
    assert.equal(r.text, "Unknown", "code " + code);
  });
});

test("every documented WMO code maps to a non-empty icon and words", function () {
  var codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
               71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  codes.forEach(function (c) {
    var day = wmo(c, false), night = wmo(c, true);
    assert.ok(day.icon && day.icon !== "·", "code " + c + " fell through to unknown");
    assert.ok(day.text && day.text !== "Unknown", "code " + c + " has no words");
    assert.ok(night.icon && night.icon !== "·", "code " + c + " has no night icon");
  });
});

test("thunder and heavy showers share the storm glyph", function () {
  assert.equal(wmo(95, false).icon, wmo(82, false).icon);
  assert.equal(wmo(96, false).text, "Thunderstorm");
});

/* ---- monochrome rule ----
   Android draws an emoji-presentation codepoint as a full-colour sprite among otherwise
   white line glyphs. U+26C5 (sun behind cloud) and U+26C8 (thunder cloud) both did exactly
   that on this ROM and now carry U+FE0E, the text-presentation selector.

   Unicode's own Emoji_Presentation property is not the right oracle here: it says "No" for
   U+26C8, which this device nevertheless renders in colour. So the rule is an allowlist of
   codepoints actually verified monochrome on the panel — anything else has to carry U+FE0E,
   and a new glyph failing this test is the test asking to be looked at on the device, not a
   bug in the test. */
var VERIFIED_MONOCHROME = new Set([
  0x00a0, 0x00b0, 0x00b7, 0x00d7, 0x2013, 0x2014, 0x2026,
  0x2039, 0x203a, 0x2190, 0x2191, 0x2192, 0x2212, 0x2248,
  0x2302, 0x21af, 0x25ad, 0x25ae, 0x25af, 0x25c6, 0x25c7, 0x25cb, 0x25cf,
  0x2600, 0x2601, 0x2602, 0x263d, 0x263e, 0x2699, 0x2715, 0x2744,
  0xfe0e
]);

function offendingCodepoints(s) {
  var bad = [];
  var chars = Array.from(String(s));
  chars.forEach(function (ch, i) {
    var cp = ch.codePointAt(0);
    if (cp < 0x80 || VERIFIED_MONOCHROME.has(cp)) return;
    if (chars[i + 1] === "︎") return;      // text-presentation selector: fine
    bad.push("U+" + cp.toString(16).toUpperCase());
  });
  return bad;
}

test("the monochrome check actually rejects a colour glyph", function () {
  /* Without this, an allowlist that silently matched everything would look like a pass. */
  assert.deepEqual(offendingCodepoints("⚡"), ["U+26A1"]);
  assert.deepEqual(offendingCodepoints("💡"), ["U+1F4A1"]);
  assert.deepEqual(offendingCodepoints("🌡"), ["U+1F321"]);
  assert.deepEqual(offendingCodepoints("⚡︎"), [], "VS15 makes it text-presentation");
  assert.deepEqual(offendingCodepoints("☀ 72° · ok"), []);
});

test("every weather glyph is text-presentation (monochrome)", function () {
  for (var code = -1; code < 120; code++) {
    [false, true].forEach(function (night) {
      var icon = wmo(code, night).icon;
      assert.deepEqual(offendingCodepoints(icon), [],
        "WMO " + code + (night ? " night" : " day") + " glyph would render in colour");
    });
  }
});

test("every Home Assistant tile glyph is text-presentation", function () {
  /* Length guard: a forEach over an empty array passes without asserting anything, so an
     emptied demoDefs would have turned this test into a green light over nothing. */
  assert.ok(app.registry.sensors.demoDefs.length >= 6,
    "demoDefs shrank to " + app.registry.sensors.demoDefs.length + " — this test asserts nothing");
  app.registry.sensors.demoDefs.forEach(function (def) {
    assert.deepEqual(offendingCodepoints(def.icon), [], def.id + " icon");
    if (def.iconOff) {
      assert.deepEqual(offendingCodepoints(def.iconOff), [], def.id + " iconOff");
    }
  });
});

test("switch-like entities carry a distinct off glyph", function () {
  /* A lamp that was off used to draw the same lit bulb as a lamp that was on. */
  var switchy = app.registry.sensors.demoDefs.filter(function (def) {
    return def.kind === "toggle" || def.kind === "binary";
  });
  /* Same guard, and stricter: this one has to see at least one of each two-state kind, or
     it is vacuous even with demoDefs full of numeric sensors. */
  assert.ok(switchy.length >= 3, "only " + switchy.length + " two-state demo entities");
  assert.ok(switchy.some(function (d) { return d.kind === "toggle"; }), "no toggle entity");
  assert.ok(switchy.some(function (d) { return d.kind === "binary"; }), "no binary entity");
  switchy.forEach(function (def) {
    assert.ok(def.iconOff, def.id + " has no off glyph");
    assert.notEqual(def.iconOff, def.icon, def.id + " uses one glyph for both states");
  });
});

test("no static glyph in index.html would render in colour", function () {
  /* Entity-decoded, because the file writes most of its glyphs as &#9881; and friends. */
  var html = require("./lib/minidom.js").decodeEntities(h.readAsset("index.html"));
  var bad = offendingCodepoints(html);
  assert.deepEqual(bad, [], "index.html contains colour codepoints: " + bad.join(", "));
});

test("the Device tile's charging and battery glyphs are monochrome", function () {
  /* "↯" (U+21AF), not "⚡" (U+26A1) — the latter drew a colour sprite in the tile row. */
  var bridge = require("./lib/fake-bridge.js");
  var charged = h.createApp({ bridge: bridge.make({ charging: true }) });
  assert.deepEqual(offendingCodepoints(charged.text("sys-big")), []);
  charged.WP.panels.open("system");
  assert.deepEqual(offendingCodepoints(charged.panelBody("system").textContent), []);
});
