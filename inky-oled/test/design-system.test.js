/* The design system: the type ramp, the one-idiom-per-concept rule, the label recipe, the
   touch-target floor and the accessible names on generated controls.

   These are the properties that make eight panels read as one app, and every one of them is
   the kind of thing that decays by accident — somebody needs a size "just a bit bigger" and
   authors a literal, or adds a boolean as a pair of buttons because the pair above it was
   one. None of it is visible in a screenshot of a single panel, which is exactly why it is
   asserted here instead of eyeballed.

   The conversion used throughout: this panel is a 711 x 1138 CSS px portrait viewport at
   devicePixelRatio 2.25, so 1vh = 11.38 CSS px = 25.6 device px, and the spec's 88 device
   px minimum touch target is 3.44vh. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");

var CSS = h.readAsset("style.css");
var HTML = h.readAsset("index.html");
/* every widget file, concatenated — the rule below is about the whole widget layer, and
   reading the directory means a new wx-*.js is covered the day it is added */
var WIDGETS_JS = require("node:fs").readdirSync(h.ASSETS)
  .filter(function (n) { return /^wx-.*\.js$/.test(n); })
  .map(function (n) { return h.readAsset(n); })
  .join("\n");

var DEVICE_PX_PER_VH = 25.6;
var MIN_TARGET_VH = 88 / DEVICE_PX_PER_VH;      // 3.44vh

/* ---------------- helpers over the stylesheet ----------------
   The reading is done by test/lib/css.js — a flat rule list, a token resolver and a small
   box model, all over the AUTHORED text, which is the thing under test. It lives in lib
   rather than here because the box model is what lets the touch-target check derive its
   subject list from the DOM instead of from a hand-written allowlist. */

var css = require("./lib/css.js");
var stripComments = css.stripComments;
var decl = css.decl;
function rules() { return css.rules(); }
var ramp = css.ramp;

/* The rule for `sel`. A selector legitimately appears more than once — .psec-t takes its
   type from the shared label recipe and its margin from the panel-content block — so when
   a property is named, the rule that actually declares it is the one wanted. */
function ruleFor(sel, prop) {
  var r = rules().filter(function (x) {
    return x.sel === sel && (!prop || decl(x.body, prop) != null);
  });
  assert.equal(r.length >= 1, true, "no rule for " + sel + (prop ? " setting " + prop : ""));
  return r[r.length - 1];
}

test("the type ramp is declared once, in vh, and is strictly increasing", function () {
  var r = ramp();
  var order = ["fs-caption", "fs-label", "fs-note", "fs-body", "fs-body-lg",
               "fs-title-sm", "fs-title", "fs-hero", "fs-display", "fs-display-xl"];
  order.forEach(function (k) {
    assert.equal(typeof r[k], "number", "the ramp has no --" + k);
  });
  assert.equal(Object.keys(r).length, order.length,
    "the ramp gained or lost a step: " + Object.keys(r).join(", "));
  for (var i = 1; i < order.length; i++) {
    assert.ok(r[order[i]] > r[order[i - 1]],
      order[i] + " (" + r[order[i]] + ") is not larger than " + order[i - 1]);
  }
});

test("the text tiers step by a consistent ratio — no tier is a rounding error", function () {
  /* Two tiers a hair apart are not a hierarchy. The five text tiers were 1.5 / 1.6 / 1.65 /
     1.7 vh before this, i.e. four "different" sizes inside 0.2vh, which is 5 device px. */
  var r = ramp();
  var text = ["fs-caption", "fs-label", "fs-note", "fs-body", "fs-body-lg",
              "fs-title-sm", "fs-title"];
  for (var i = 1; i < text.length; i++) {
    var ratio = r[text[i]] / r[text[i - 1]];
    assert.ok(ratio > 1.1 && ratio < 1.25,
      text[i - 1] + " -> " + text[i] + " is a ratio of " + ratio.toFixed(3)
      + "; the ramp is meant to step by ~1.16");
  }
});

test("no font-size anywhere is authored as a literal", function () {
  /* The single rule that keeps the ramp real. Every size must come from a token, so that
     changing a tier changes it everywhere and adding a size means choosing a step. */
  var offenders = rules().filter(function (r) {
    if (/^:root/.test(r.sel)) return false;              // the ramp itself
    var v = decl(r.body, "font-size");
    return v && v.indexOf("var(--fs-") === -1;
  });
  assert.deepEqual(offenders.map(function (r) {
    return r.sel + " { font-size: " + decl(r.body, "font-size") + " }";
  }), []);
});

test("neither the markup nor the widgets author any size of their own", function () {
  assert.equal(/font-size/.test(HTML), false, "index.html sets a font-size inline");
  assert.equal(/font-size/.test(stripComments(WIDGETS_JS)), false,
    "widgets.js emits a font-size; a widget picks a CLASS, never a size");
});

test("landscape restates the whole ramp rather than overriding elements piecemeal", function () {
  /* The old landscape block hand-tuned nine elements at nine different multipliers (.time
     2.2x, .wx-temp 2.1x, .big-icon 1.5x), which is a second, inconsistent design system for
     an orientation nobody looks at. */
  var land = /@media \(orientation: landscape\)\s*\{([\s\S]*)$/.exec(stripComments(CSS));
  assert.ok(land, "no landscape block");
  var names = Object.keys(ramp());
  names.forEach(function (k) {
    assert.match(land[1], new RegExp("--" + k + "\\s*:"),
      "landscape does not restate --" + k);
  });
  assert.equal(/font-size/.test(land[1]), false,
    "landscape still overrides a font-size directly");
});

test("the landscape ramp is a RAMP, not ten restatements of one number", function () {
  /* The test above only asks that every token is mentioned again, and a mutation that set
     all ten landscape steps to the same 2.0vh passed it: the hierarchy was gone —
     the clock, a chip and a caption all the same size — while the suite stayed green.
     Restating a token is not the property; being a scale is. Both scales are therefore
     asserted the same way, and the landscape one has to be larger, since the whole reason
     the block exists is that a landscape viewport is short. */
  var portrait = ramp(), land = css.landscapeRamp();
  var order = ["fs-caption", "fs-label", "fs-note", "fs-body", "fs-body-lg",
               "fs-title-sm", "fs-title", "fs-hero", "fs-display", "fs-display-xl"];
  order.forEach(function (k) {
    assert.equal(typeof land[k], "number", "the landscape ramp has no --" + k);
    assert.ok(land[k] > portrait[k],
      "--" + k + " is " + land[k] + "vh in landscape and " + portrait[k] + "vh in portrait;"
      + " a shorter viewport needs a larger vh for the same physical size");
  });
  for (var i = 1; i < order.length; i++) {
    assert.ok(land[order[i]] > land[order[i - 1]],
      "landscape --" + order[i] + " (" + land[order[i]] + ") is not larger than --"
      + order[i - 1] + " (" + land[order[i - 1]] + ")");
  }
  /* and the text tiers keep the same ~1.16 relationship they have in portrait */
  for (var j = 1; j < 7; j++) {
    var ratio = land[order[j]] / land[order[j - 1]];
    assert.ok(ratio > 1.1 && ratio < 1.25,
      "landscape " + order[j - 1] + " -> " + order[j] + " is a ratio of " + ratio.toFixed(3));
  }
});

/* ---------------- the label recipe (D6) ---------------- */

test("every small-caps label is drawn from one recipe", function () {
  /* UNITS in Settings, AIR in Conditions, BATTERY in Device and NOW on the home card have
     to be the same object. They were authored separately and had drifted to five sizes,
     four letter-spacings and two weights. */
  var recipe = rules().filter(function (r) {
    return r.sel.indexOf(".psec-t,") === 0 && /text-transform/.test(r.body);
  })[0];
  assert.ok(recipe, "the shared label rule is gone");
  [".card-label", ".mini-head", ".stat-k", ".fc-name", ".hr-t", ".wc-city"].forEach(function (s) {
    assert.ok(recipe.sel.indexOf(s) !== -1, s + " is no longer on the shared label rule");
  });
  assert.equal(decl(recipe.body, "letter-spacing"), "var(--label-track)");
  assert.equal(decl(recipe.body, "font-weight"), "var(--label-weight)");
  assert.equal(decl(recipe.body, "text-transform"), "uppercase");

  /* The tokens' VALUES, not just the fact that they are referenced. A mutation that set
     --label-track to 0em and --label-weight to 900 survived every assertion above: the
     recipe was still one recipe, still referenced, still uppercase — and every label in
     the app had become bold, tightly-set capitals, which is a different design. Ranges
     rather than exact numbers, because the point is the look and not the digit: tracking
     is what makes capitals legible at 2-4 m, and a light weight is what stops a wall of
     small caps shouting. */
  var root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(CSS))[1];
  var track = parseFloat(/--label-track:\s*([\d.]+)em/.exec(root)[1]);
  var weight = parseInt(/--label-weight:\s*(\d+)/.exec(root)[1], 10);
  assert.ok(track >= 0.1 && track <= 0.25,
    "--label-track is " + track + "em; small caps without tracking read as a smudge");
  assert.ok(weight >= 400 && weight <= 600,
    "--label-weight is " + weight + "; a label is not meant to outweigh its own value");

  /* and nothing re-declares those properties for itself afterwards */
  var strays = rules().filter(function (r) {
    if (r.sel === recipe.sel) return false;
    return /(^|,\s*)\.(card-label|mini-head|stat-k|fc-name|hr-t|wc-city)\b/.test(r.sel)
      && (decl(r.body, "letter-spacing") || decl(r.body, "text-transform"));
  });
  assert.deepEqual(strays.map(function (r) { return r.sel; }), []);
});

test("a section heading outranks the field labels under it", function () {
  /* .psec-t was 1.7vh and .stat-k 1.6vh, both --dimmer: a 0.1vh difference is not a
     hierarchy, and the Conditions panel read as one flat wall of small caps. */
  var r = ramp();
  var psec = ruleFor(".psec-t", "font-size");
  assert.equal(decl(psec.body, "font-size"), "var(--fs-note)");
  assert.equal(decl(psec.body, "color"), "var(--dim)");
  assert.ok(r["fs-note"] > r["fs-label"], "a heading must be a step above a field label");
});

/* ---------------- one idiom per concept (D1) ---------------- */

test("Settings uses paired buttons only for a genuine two-value choice", function () {
  var app = h.createApp({});
  app.WP.panels.open("settings");
  var panel = app.qs('[data-panel="settings"]');

  var segs = panel.querySelectorAll(".seg");
  var acts = segs.map(function (s) {
    return s.querySelector("[data-act]").getAttribute("data-act");
  }).sort();
  assert.deepEqual(acts, ["hours", "units"],
    "a boolean came back as a pair of buttons: " + acts.join(", "));
});

test("every on/off in Settings is the same switch row", function () {
  var app = h.createApp({});
  app.WP.panels.open("settings");
  var panel = app.qs('[data-panel="settings"]');

  var rows = panel.querySelectorAll(".srow");
  var acts = rows.map(function (r) { return r.getAttribute("data-act"); });
  /* seconds, burn-in, and one per widget */
  assert.equal(acts.filter(function (a) { return a === "secs"; }).length, 1);
  assert.equal(acts.filter(function (a) { return a === "burn"; }).length, 1);
  assert.equal(acts.filter(function (a) { return a === "widget"; }).length,
    app.WP.WIDGETS.length);

  rows.forEach(function (r) {
    assert.equal(r.getAttribute("role"), "switch", r.getAttribute("data-act") + " row");
    assert.match(r.getAttribute("aria-checked") || "", /^(true|false)$/);
    assert.ok(r.querySelector(".switch"), "a switch row with no switch in it");
  });
});

test("a switch row's aria-checked follows the setting it controls", function () {
  var app = h.createApp({});
  app.WP.panels.open("settings");
  function row(act, arg) {
    return app.qs('[data-panel="settings"] [data-act="' + act + '"]'
      + (arg ? '[data-arg="' + arg + '"]' : ""));
  }
  assert.equal(row("secs").getAttribute("aria-checked"), "false");
  app.tap(row("secs"));
  assert.equal(app.WP.settings.get("seconds"), true, "the row did not toggle the setting");
  assert.equal(row("secs").getAttribute("aria-checked"), "true");
  assert.ok(row("secs").querySelector(".switch").classList.contains("on"));

  /* tapping again toggles back — a switch is not a one-way button */
  app.tap(row("secs"));
  assert.equal(app.WP.settings.get("seconds"), false);
  assert.equal(row("secs").getAttribute("aria-checked"), "false");

  assert.equal(row("widget", "daily").getAttribute("aria-checked"), "true");
  app.tap(row("widget", "daily"));
  assert.equal(app.WP.settings.get("show").daily, false);
  assert.equal(row("widget", "daily").getAttribute("aria-checked"), "false");
});

test("burn-in protection is explained in one line, not a paragraph", function () {
  /* D5. It was five lines of body copy on a settings screen; the long version lives in
     INTERACTIVE.md. The switch's own note is the only prose allowed here. */
  var app = h.createApp({});
  app.WP.panels.open("settings");
  var burn = app.qs('[data-panel="settings"] [data-act="burn"]');
  var note = burn.querySelector(".srow-x");
  assert.ok(note, "the burn-in switch lost its one-line reason");
  assert.ok(note.textContent.length < 90,
    "the burn-in note is " + note.textContent.length + " characters: " + note.textContent);
  var sec = app.qsa('[data-panel="settings"] .psec').filter(function (s) {
    return s.querySelector(".psec-t").textContent === "Display";
  })[0];
  assert.equal(sec.querySelectorAll(".muted").length, 0,
    "the burn-in paragraph is back");
});

/* ---------------- developer language (D4) ----------------

   This used to read [data-sub] and nothing else, which is why it passed for five rounds
   while the wall itself carried `sensor.living_room_temperature` twice, `UNIX TIME
   1786999387`, `DOMAIN / SOURCE / SAMPLES`, `screen 711 × 1138` and `Interface wlan0`. A
   subtitle is one line out of a few hundred; the rest of the panel is what a person reads.

   So it sweeps every rendered string in the home view and in all eight panel bodies.

   Text is collected as individual LEAF TEXT NODES, not as textContent: concatenating a
   panel gives you "Samples241Entity", which destroys the word boundaries these patterns
   depend on and hides an offender inside a run of digits.

   Each pattern is something no one standing in front of a wall panel would say. It is
   deliberately not a list of banned words: a Device panel may legitimately report a screen
   size and an Android version, so what is banned is naming the MACHINERY (an entity id, a
   kernel interface name, an epoch counter, a CSS viewport) rather than naming a fact. */

var JARGON = [
  ["names where a setting is stored", /localStorage|force-stop|\bconfig\.js\b|\bassets\//i],
  ["a URL, an origin or a credential", /https?:\/\/|baseUrl|API key|\bbearer\b|\btoken\b/i],
  ["a raw Home Assistant entity id",
   /\b(sensor|switch|light|fan|binary_sensor|climate|cover|lock|media_player)\.[a-z0-9_]+/],
  ["the machinery behind a reading",
   /\bentity[ _]?id\b|\bdomain\b|\bsamples?\b|\bsimulator\b|\bpayload\b|\bendpoint\b/i],
  ["a clock only a computer reads", /\bunix\b|\bepoch\b|\bISO ?8601\b|\bmillis(econds)?\b/i],
  ["a rendering detail rather than a fact about the room",
   /\bviewport\b|\bdpr\b|\bdevice ?pixel|\bcss px\b|\bscreen \d+\s*[×x]\s*\d+/i],
  ["an internal interface", /\bREST\b|\bJSON\b|\bAPI\b|\bJNI\b|\bbridge\b|\b(wlan|eth)\d\b/i],
  ["a JavaScript value that escaped onto the wall", /\b(undefined|NaN|\[object)\b/]
];

/* every leaf string under `root`, trimmed, empties dropped */
function strings(root) {
  var out = [];
  (function walk(n) {
    (n.children || []).forEach(function (c) {
      if (c.nodeType === 3) { var s = c.data.trim(); if (s) out.push(s); return; }
      walk(c);
    });
  })(root);
  return out;
}

test("nothing the wall says is written for whoever built the app", function () {
  var app = h.createApp({ bridge: require("./lib/fake-bridge.js").make({}) });
  var wx = require("./lib/wx-fixture.js");
  app.registry.weather.data = wx.build({ now: app.clock.now, hours: 48 });
  app.registry.weather.publish();
  app.registry.air.data = wx.aqi({ now: app.clock.now });

  var offenders = [];
  function sweep(where, label) {
    strings(where).forEach(function (s) {
      JARGON.forEach(function (rule) {
        if (rule[1].test(s)) offenders.push(label + ": “" + s + "” — " + rule[0]);
      });
    });
  }

  sweep(app.$("home"), "home");
  app.qsa("[data-panel]").forEach(function (p) {
    var name = p.getAttribute("data-panel");
    app.WP.panels.open(name);
    sweep(p.querySelector("[data-sub]"), name + " subtitle");
    sweep(app.panelBody(name), name);
    app.WP.panels.close();
  });
  assert.deepEqual(offenders, []);
});

test("the copy sweep can actually see a panel body", function () {
  /* The failure this test exists to prevent is the previous one's: a sweep pointed at a
     node that is empty passes forever. Assert the corpus is real, and that the patterns
     fire when something bad is genuinely in it. */
  var app = h.createApp({ bridge: require("./lib/fake-bridge.js").make({}) });
  var wx = require("./lib/wx-fixture.js");
  app.registry.weather.data = wx.build({ now: app.clock.now, hours: 48 });
  app.registry.weather.publish();
  app.registry.air.data = wx.aqi({ now: app.clock.now });
  app.qsa("[data-panel]").forEach(function (p) {
    var name = p.getAttribute("data-panel");
    app.WP.panels.open(name);
    assert.ok(strings(app.panelBody(name)).length >= 5,
      name + " panel body yielded almost no text — the sweep is reading the wrong node");
    app.WP.panels.close();
  });

  [["sensor.living_room_temperature", 2], ["Unix time", 4], ["Samples", 3],
   ["screen 711 × 1138", 5], ["Interface wlan0", 6], ["saved to localStorage", 0]
  ].forEach(function (probe) {
    assert.equal(JARGON[probe[1]][1].test(probe[0]), true,
      "the sweep would no longer catch: " + probe[0]);
  });
});

/* ---------------- the home tile row (D8) ---------------- */

test("the three home tiles are one object repeated", function () {
  var app = h.createApp({});
  var tiles = app.qsa("#home .row3 .card.mini");
  assert.equal(tiles.length, 6);   // device/timer/settings + moon/air/calendar
  var shape = tiles.map(function (t) {
    return t.children.filter(function (c) { return c.nodeType === 1; })
      .map(function (c) { return c.getAttribute("class").split(" ")[0]; }).join(",");
  });
  assert.deepEqual(shape, shape.map(function () { return shape[0]; }),
    "the tiles do not have the same three lines: " + shape.join(" | "));
  assert.equal(shape[0], "mini-head,mini-big,mini-sub");

  /* the value line's BOX is pinned, so the third line sits on one baseline across all
     three even though one of them holds a glyph where the others hold digits */
  var big = ruleFor(".mini-big", "height");
  assert.match(decl(big.body, "height") || "", /calc\(var\(--fs-title-sm\)/);
  assert.match(decl(ruleFor(".mini-big.glyph", "font-size").body, "font-size") || "",
    /calc\(var\(--fs-title-sm\)/);
});

/* ---------------- motion (D7) ---------------- */

test("every duration in the app comes from a motion token", function () {
  /* ANIMATION as well as TRANSITION. This read `transition:` only, and the stylesheet had
     three `animation: pulse 1s infinite` declarations sitting off the token scale — so the
     comment beside the tokens ("nothing in the app animates on a number that is not one of
     these") was false, and a mutation moving the alert pulse to 3.7s passed. A duration is
     a duration whichever property carries it. */
  var offenders = [];
  rules().forEach(function (r) {
    ["transition", "animation", "animation-duration", "transition-duration"].forEach(function (prop) {
      var t = decl(r.body, prop);
      if (!t) return;
      (t.match(/(^|\s)[\d.]+m?s\b/g) || []).forEach(function (lit) {
        offenders.push(r.sel + " { " + prop + ": ..." + lit.trim() + "... }");
      });
    });
  });
  assert.deepEqual(offenders, []);
  ["--ease", "--dur-press", "--dur-ui", "--dur-fill", "--dur-drift", "--dur-pulse"]
    .forEach(function (k) {
      assert.match(CSS, new RegExp(k + "\\s*:"), "no " + k + " token");
    });
  /* and the pulse is still a breath rather than a blink */
  assert.match(stripComments(CSS), /--dur-pulse:\s*(0\.[6-9]|1(\.[0-5])?)s/);
});

test("the switch knob slides and the panel fade is unchanged", function () {
  /* "switches animate their knob rather than snapping" — the knob moves by transform, and
     a transform with no transition is a snap. */
  var knob = ruleFor(".switch span", "transition");
  assert.match(decl(knob.body, "transition") || "", /transform var\(--dur-ui\)/);
  assert.match(decl(ruleFor(".sensor-sw span", "transition").body, "transition") || "",
    /transform var\(--dur-ui\)/);
  /* the 200ms panel entrance is a do-not-regress item, so pin the token's value too */
  assert.match(stripComments(CSS), /--dur-ui:\s*0\.2s/);
  assert.match(stripComments(CSS), /--dur-drift:\s*4s/);
});

test("every tappable class has a pressed state on the press clock", function () {
  var press = ruleFor(".tappable.is-press", "transform");
  assert.ok(decl(press.body, "background-color"), "no pressed fill");
  assert.ok(decl(press.body, "transform"), "no pressed movement");
  assert.match(decl(ruleFor(".tappable", "transition").body, "transition") || "", /var\(--dur-press\)/);
});

/* ---------------- touch targets ----------------

   The subject list is taken from the DOM — every distinct class carrying `.tappable`,
   anywhere in the home view or in any of the eight panels — and not from an allowlist.
   The allowlist named eight selectors and the app has thirteen kinds of control; the five
   it did not name included the Home Assistant tile and the hourly chip, and a mutation
   that drove the tile's padding to zero passed. A list maintained by hand goes stale the
   first time a widget gains a control; this one cannot. */

/* Boot everything so that every kind of control is on screen at least once: the bridge for
   the Device panel and a forecast for the strip, the hourly list and the daily row.
   (`.lap` was on the old allowlist and is not here, correctly — a lap row is a read-only
   line of text, not something a finger aims at. It takes its padding off the same scale
   regardless, because it sits in a list among things that are.) */
function everyTappable() {
  var app = h.createApp({ bridge: require("./lib/fake-bridge.js").make({}) });
  var wx = require("./lib/wx-fixture.js");
  app.registry.weather.data = wx.build({ now: app.clock.now, hours: 48 });
  app.registry.weather.publish();

  var found = Object.create(null);
  function sweep(where, label) {
    app.qsa(".tappable", where).forEach(function (n) {
      var kind = (n.getAttribute("class") || "").split(/\s+/)[0];
      if (kind && !found[kind]) found[kind] = { el: n, where: label };
    });
  }
  sweep(app.doc, "home");
  app.qsa("[data-panel]").forEach(function (p) {
    var name = p.getAttribute("data-panel");
    app.WP.panels.open(name);
    sweep(p, name);
    app.WP.panels.close();
  });
  return found;
}

test("no control anywhere in the app is under 88 device px", function () {
  var found = everyTappable();
  var kinds = Object.keys(found);
  assert.ok(kinds.length >= 12,
    "only " + kinds.length + " kinds of control were found — the sweep is not reaching the "
    + "panels, and a sweep that finds nothing passes forever");
  /* the three the old allowlist did not name, and one of which a mutation walked through */
  ["sensor", "hr", "fc-day", "card"].forEach(function (k) {
    assert.ok(kinds.indexOf(k) !== -1,
      "the sweep missed ." + k + "; it found: " + kinds.join(", "));
  });

  var small = kinds.filter(function (k) {
    return css.boxVh(found[k].el) < MIN_TARGET_VH;
  }).map(function (k) {
    return "." + k + " is " + (css.boxVh(found[k].el) * DEVICE_PX_PER_VH).toFixed(0)
      + " device px tall (" + found[k].where + ")";
  });
  assert.deepEqual(small, []);
});

test("every control's padding comes off the spacing scale", function () {
  /* The floor above has roughly 2x slack on most controls, which is why a mutation that
     cut a settings row's vertical padding by 76% — visibly wrecking the rhythm of the
     panel — sailed through it: only a padding of exactly zero was ever caught. So the
     assertion is the same shape as the type ramp's: a control does not author a spacing of
     its own, it picks a step. That makes "0.4vh" a failure for the reason it is actually
     wrong (it is not one of the sizes this app draws controls at), rather than waiting for
     it to breach a minimum it never quite breaches. */
  var scale = css.tokens();
  var steps = Object.keys(scale).filter(function (k) { return k.indexOf("pad-") === 0; });
  assert.ok(steps.length >= 4 && steps.length <= 6,
    "the spacing scale has " + steps.length + " steps; a scale with one step per control "
    + "is not a scale: " + steps.join(", "));

  var found = everyTappable();
  var offenders = [];
  Object.keys(found).forEach(function (k) {
    var el = found[k].el;
    /* a control sized by an explicit height (the two round icon buttons) sets no padding */
    if (css.vh(css.styleOf(el, "height")) != null) return;
    var p = css.styleOf(el, "padding");
    if (!p) return;                                     // inherits its box from a parent
    var name = css.tokenName(p.split(/\s+/)[0]);
    if (!name || name.indexOf("pad-") !== 0) {
      offenders.push("." + k + " { padding: " + p + " } — not a step on the scale");
    }
  });
  assert.deepEqual(offenders, []);
});

test("the hourly list is a bar chart, so its columns have a fixed origin", function () {
  /* Measured on device: the sun rows' bars started at x=382, the moon rows' at 356 and the
     cloud rows' at 391 — a 35 device px swing driven purely by which glyph the weather put
     in the column, because `.hrow-i` was the one column authored `flex: 0 0 auto` while
     every sibling had a fixed basis. A bar chart whose baseline moves per row is not a bar
     chart. No test touched this geometry at all, and two mutations against it survived. */
  [".hrow-t", ".hrow-i", ".hrow-d", ".hrow-p"].forEach(function (sel) {
    var flex = decl(ruleFor(sel, "flex").body, "flex");
    assert.match(flex, /^0 0 [\d.]+v[wh]$/,
      sel + " is `flex: " + flex + "`; a column with no fixed basis moves the bar beside it");
  });
  assert.match(decl(ruleFor(".hrow-bar", "flex").body, "flex"), /^1 1 auto$/,
    "the bar itself is the only column that may take the remainder");
  assert.equal(decl(ruleFor(".hrow-i", "text-align").body, "text-align"), "center",
    "a glyph narrower than its column has to be centred in it or the origin moves again");
});

/* ---------------- accessible names on generated controls ---------------- */

/* what a reader would actually be given: aria-label wins, otherwise the text with every
   aria-hidden subtree removed */
function accessibleName(el) {
  var label = el.getAttribute("aria-label");
  if (label) return label.trim();
  var out = "";
  (function walk(n) {
    (n.children || []).forEach(function (c) {
      if (c.nodeType === 3) { out += c.data; return; }
      if (c.getAttribute && c.getAttribute("aria-hidden") === "true") return;
      walk(c);
    });
  })(el);
  return out.trim();
}

test("every button in the app has an accessible name, in every panel", function () {
  var app = h.createApp({ bridge: require("./lib/fake-bridge.js").make({}) });
  var wx = require("./lib/wx-fixture.js");
  app.registry.weather.data = wx.build({ now: app.clock.now, hours: 48 });
  app.registry.weather.publish();

  var nameless = [];
  function sweep(where) {
    app.qsa("button", where).forEach(function (b) {
      var n = accessibleName(b);
      /* a name made only of symbols is not a name — that is the icon-only case */
      if (!n || !/[a-z0-9]/i.test(n)) {
        nameless.push((where === app.doc ? "home" : where.getAttribute("data-panel"))
          + ": <" + (b.getAttribute("class") || "").split(" ")[0] + ">");
      }
    });
  }
  sweep(app.doc);
  app.qsa("[data-panel]").forEach(function (p) {
    app.WP.panels.open(p.getAttribute("data-panel"));
    sweep(p);
    app.WP.panels.close();
  });
  assert.deepEqual(nameless, []);
});

test("generated toggles announce as switches and say which way they are set", function () {
  var app = h.createApp({});
  var tiles = app.qsa("#sensors .sensor").filter(function (t) {
    return t.getAttribute("data-act") === "toggle";
  });
  assert.ok(tiles.length >= 2, "no toggle tiles to check");
  tiles.forEach(function (t) {
    assert.equal(t.getAttribute("role"), "switch");
    var e = app.registry.sensors.find(t.getAttribute("data-arg"));
    assert.equal(t.getAttribute("aria-checked"), e.on ? "true" : "false");
  });

  var t0 = tiles[0];
  var before = t0.getAttribute("aria-checked");
  app.tap(t0);
  var after = app.qs('#sensors [data-arg="' + t0.getAttribute("data-arg") + '"]')
    .getAttribute("aria-checked");
  assert.notEqual(after, before, "aria-checked did not follow the toggle");
});

test("single-choice button groups are radiogroups, not loose buttons", function () {
  /* Without this a reader is told "12-hour, button" and "24-hour, button" with nothing to
     say that they are alternatives or which one is in force. */
  var app = h.createApp({});
  ["settings", "timer"].forEach(function (name) {
    app.WP.panels.open(name);
    app.qsa('[data-panel="' + name + '"] .seg').forEach(function (g) {
      assert.equal(g.getAttribute("role"), "radiogroup", name + " .seg");
      assert.ok(g.getAttribute("aria-label"), name + " .seg has no group name");
      var checked = g.querySelectorAll('[role="radio"]').filter(function (b) {
        return b.getAttribute("aria-checked") === "true";
      });
      assert.equal(checked.length, 1, name + ": exactly one option must be checked");
    });
    app.WP.panels.close();
  });
});

test("decorative glyphs are hidden from the accessibility tree, not read out", function () {
  var app = h.createApp({});
  var wx = require("./lib/wx-fixture.js");
  app.registry.weather.data = wx.build({ now: app.clock.now, hours: 48 });
  app.registry.weather.publish();

  /* the home card glyphs, and the ones inside generated buttons */
  assert.equal(app.$("wx-icon").getAttribute("aria-hidden"), "true");
  app.qsa("#hourly .hr").forEach(function (chip) {
    assert.equal(chip.querySelector(".hr-i").getAttribute("aria-hidden"), "true");
    assert.match(chip.getAttribute("aria-label") || "", /\d/,
      "an hour chip with a hidden glyph and no spoken label says nothing");
  });
  app.qsa("#forecast .fc-day").forEach(function (d) {
    assert.equal(d.querySelector(".fc-icon").getAttribute("aria-hidden"), "true");
    assert.ok(d.getAttribute("aria-label"));
  });
});

test("the live regions are the two lines that actually change on their own", function () {
  assert.match(HTML, /id="status"[^>]*aria-live="polite"/);
  assert.match(HTML, /id="toast"[^>]*aria-live="polite"/);
  /* the full-screen alarm is the one thing that must interrupt */
  assert.match(HTML, /id="alarm"[^>]*[\s\S]{0,120}role="alertdialog"/);
});

test("ARIA did not arrive by turning controls into non-buttons", function () {
  /* Every regression risk in this area is the same shape: a role attribute silently
     replaces the delegation contract. hit() resolves on data-open / data-act / data-close,
     and boot() already warns about orphans — assert the count is zero rather than trusting
     the warning to be read. */
  var app = h.createApp({});
  app.WP.panels.open("settings");
  assert.deepEqual(app.logs.warn, []);
  app.qsa('[data-panel="settings"] .srow').forEach(function (r) {
    assert.equal(r.tagName, "BUTTON", "a switch row stopped being a button");
    assert.ok(r.getAttribute("data-act"), "a switch row left the pointer delegation");
  });
});
