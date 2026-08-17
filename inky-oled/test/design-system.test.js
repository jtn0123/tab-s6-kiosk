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
   A real parser is not needed and would be worse: what these read is the AUTHORED text,
   which is the thing under test. Comments are stripped first so the prose in this
   stylesheet — which quotes plenty of old font-size values — cannot be mistaken for code. */

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }

/* every "selector { body }" pair, flattened (nested at-rules included) */
function rules(css) {
  var out = [];
  var re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(stripComments(css)))) {
    out.push({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  }
  return out;
}

function decl(body, prop) {
  var m = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)").exec(body);
  return m ? m[1].trim() : null;
}

/* The rule for `sel`. A selector legitimately appears more than once — .psec-t takes its
   type from the shared label recipe and its margin from the panel-content block — so when
   a property is named, the rule that actually declares it is the one wanted. */
function ruleFor(sel, prop) {
  var r = rules(CSS).filter(function (x) {
    return x.sel === sel && (!prop || decl(x.body, prop) != null);
  });
  assert.equal(r.length >= 1, true, "no rule for " + sel + (prop ? " setting " + prop : ""));
  return r[r.length - 1];
}

/* sum of the vh numbers in a padding shorthand's vertical positions */
function verticalPadding(body) {
  var p = decl(body, "padding");
  if (!p) return 0;
  var parts = p.split(/\s+/);
  var top = parts[0], bottom = parts.length >= 3 ? parts[2] : parts[0];
  function vh(v) { var m = /^(-?[\d.]+)vh$/.exec(v); return m ? parseFloat(m[1]) : 0; }
  return vh(top) + vh(bottom);
}

/* ---------------- the ramp ---------------- */

function ramp() {
  var root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(CSS));
  assert.ok(root, "no :root block");
  var out = {}, re = /--(fs-[a-z-]+)\s*:\s*([\d.]+)vh/g, m;
  while ((m = re.exec(root[1]))) out[m[1]] = parseFloat(m[2]);
  return out;
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
  var offenders = rules(CSS).filter(function (r) {
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

/* ---------------- the label recipe (D6) ---------------- */

test("every small-caps label is drawn from one recipe", function () {
  /* UNITS in Settings, AIR in Conditions, BATTERY in Device and NOW on the home card have
     to be the same object. They were authored separately and had drifted to five sizes,
     four letter-spacings and two weights. */
  var recipe = rules(CSS).filter(function (r) {
    return r.sel.indexOf(".psec-t,") === 0 && /text-transform/.test(r.body);
  })[0];
  assert.ok(recipe, "the shared label rule is gone");
  [".card-label", ".mini-head", ".stat-k", ".fc-name", ".hr-t", ".wc-city"].forEach(function (s) {
    assert.ok(recipe.sel.indexOf(s) !== -1, s + " is no longer on the shared label rule");
  });
  assert.equal(decl(recipe.body, "letter-spacing"), "var(--label-track)");
  assert.equal(decl(recipe.body, "font-weight"), "var(--label-weight)");
  assert.equal(decl(recipe.body, "text-transform"), "uppercase");

  /* and nothing re-declares those properties for itself afterwards */
  var strays = rules(CSS).filter(function (r) {
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
    return s.querySelector(".psec-t").textContent === "Burn-in protection";
  })[0];
  assert.equal(sec.querySelectorAll(".muted").length, 0,
    "the burn-in paragraph is back");
});

/* ---------------- developer language (D4) ---------------- */

test("no panel subtitle is written for whoever built the app", function () {
  var app = h.createApp({ bridge: require("./lib/fake-bridge.js").make({}) });
  var jargon = /localStorage|force-stop|config\.js|REST API|baseUrl|\bbridge\b|viewport|API key|http:\/\/|https:\/\//i;
  app.qsa("[data-panel]").forEach(function (p) {
    var name = p.getAttribute("data-panel");
    app.WP.panels.open(name);
    var sub = p.querySelector("[data-sub]").textContent;
    assert.equal(jargon.test(sub), false, name + " subtitle: " + sub);
    app.WP.panels.close();
  });
});

/* ---------------- the home tile row (D8) ---------------- */

test("the three home tiles are one object repeated", function () {
  var app = h.createApp({});
  var tiles = app.qsa("#home .row3 .card.mini");
  assert.equal(tiles.length, 3);
  var shape = tiles.map(function (t) {
    return t.children.filter(function (c) { return c.nodeType === 1; })
      .map(function (c) { return c.getAttribute("class").split(" ")[0]; }).join(",");
  });
  assert.deepEqual(shape, [shape[0], shape[0], shape[0]],
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

test("every transition duration comes from the four motion tokens", function () {
  var offenders = [];
  rules(CSS).forEach(function (r) {
    var t = decl(r.body, "transition");
    if (!t) return;
    (t.match(/(^|\s)[\d.]+m?s\b/g) || []).forEach(function (lit) {
      offenders.push(r.sel + " { transition: ..." + lit.trim() + "... }");
    });
  });
  assert.deepEqual(offenders, []);
  ["--ease", "--dur-press", "--dur-ui", "--dur-fill", "--dur-drift"].forEach(function (k) {
    assert.match(CSS, new RegExp(k + "\\s*:"), "no " + k + " token");
  });
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

/* ---------------- touch targets ---------------- */

test("no control on the ramp fell below 88 device px", function () {
  /* The ramp moved several font sizes, and the padding-driven controls take their height
     from padding + line box. Recomputed here from the authored CSS rather than trusted. */
  var r = ramp();
  var LINE = 1.2;                        // the browser's default line-height factor
  [
    [".btn", "fs-body-lg"], [".chip", "fs-body"], [".seg-b", "fs-body-lg"],
    [".srow", "fs-body-lg"], [".wide-btn", "fs-body-lg"], [".link-btn", "fs-note"],
    [".lap", "fs-body-lg"], [".hrow", "fs-body"]
  ].forEach(function (pair) {
    var rule = ruleFor(pair[0], "padding");
    var declared = decl(rule.body, "font-size");
    var size = declared ? r[/--(fs-[a-z-]+)/.exec(declared)[1]] : r[pair[1]];
    var height = verticalPadding(rule.body) + size * LINE;
    assert.ok(height >= MIN_TARGET_VH,
      pair[0] + " is " + (height * DEVICE_PX_PER_VH).toFixed(0)
      + " device px tall, under the 88 px floor");
  });

  /* the two with an explicit height */
  assert.ok(parseFloat(decl(ruleFor(".icon-btn", "height").body, "height")) >= MIN_TARGET_VH);
  assert.ok(parseFloat(decl(ruleFor(".close-btn", "height").body, "height")) >= MIN_TARGET_VH);
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
