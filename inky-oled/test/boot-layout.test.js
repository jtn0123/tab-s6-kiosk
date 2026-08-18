/* Boot behaviour and the home column's height budget.

   The column is a fixed budget and the honest measurement is the on-device one, so the
   geometry here is stated by the test rather than computed from CSS. What is being checked
   is the arithmetic the app does with those numbers: the 1.3x growth cap, the slack/overflow
   report, and the fact that overflow is escalated to a warning instead of being swallowed. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");

var CARD_H = 150;
var VIEW_H = 1300;   // 8 home children x 150 + 100 slack

var VIEW_W = 800;

/* Give #home and its children a believable layout. */
function layout(app, opts) {
  opts = opts || {};
  var home = app.$("home");
  home.clientHeight = VIEW_H;
  home.scrollHeight = opts.scrollHeight == null ? VIEW_H : opts.scrollHeight;
  home.clientWidth = VIEW_W;
  home.scrollWidth = opts.scrollWidth == null ? VIEW_W : opts.scrollWidth;
  home.setRect({ left: 0, top: 0, right: VIEW_W, bottom: VIEW_H });

  var kids = app.qsa("#home > *").filter(function (n) { return n.id !== "empty"; });
  var y = 0;
  kids.forEach(function (n) {
    n.offsetHeight = opts.cardHeight == null ? CARD_H : opts.cardHeight;
    n.setRect({ left: 0, top: y, right: 800, bottom: y + n.offsetHeight });
    y += n.offsetHeight;
  });
  return kids;
}

test("boot logs the bridge, viewport and dpr, and raises nothing else", function () {
  var app = h.createApp({});
  assert.equal(app.logs.log.length, 1);
  assert.match(app.logs.log[0], /^\[inky\] booted; bridge=false viewport=1600x2560 dpr=2$/);
  assert.deepEqual(app.logs.warn, []);
  assert.deepEqual(app.logs.error, []);
});

test("every widget registers and initialises", function () {
  var app = h.createApp({});
  var names = Object.keys(app.registry).sort();
  /* sky is registered but is not a WIDGET: it has no card, no panel and no show/hide
     switch — it is the background layer, initialised through the same registry. */
  assert.deepEqual(names, ["air", "calendar", "clock", "daily", "hourly", "moon", "news",
                           "sensors", "settings", "sky", "system", "timer", "weather"]);
  /* each one has painted something into its card */
  assert.notEqual(app.text("time"), "--:--");
  assert.notEqual(app.text("date").trim(), "");
  assert.equal(app.text("tmr-big"), "00:00");
  assert.ok(app.qsa("#sensors .sensor").length > 0);
});

test("a plugin whose init explodes does not take the dashboard down", function () {
  var app = h.createApp({ boot: false });
  app.WP.register({ name: "grenade", init: function () { throw new Error("boom"); } });
  app.boot();
  assert.match(app.logs.error.join(" "), /plugin grenade init failed: boom/);
  assert.equal(app.text("tmr-big"), "00:00", "the other widgets still came up");
});

test("the layout report is logged once the cards have their content", function () {
  var app = h.createApp({});
  layout(app);
  app.advance(12500);                       // the deferred boot measurement
  var line = app.logs.log.filter(function (l) { return l.indexOf("[inky] layout:") === 0; })[0];
  assert.ok(line, "no layout line was logged");
  assert.match(line, /home overflow=0 overflowX=0 slack=100px cards=8/);
});

test("overflow is escalated to a warning, not logged as if it were fine", function () {
  /* overflow > 0 means a card grew and the bottom tile row is being clipped off a wall
     panel nobody is standing in front of. */
  var app = h.createApp({});
  layout(app, { scrollHeight: VIEW_H + 40 });
  app.WP.settings.set("seconds", true);
  app.advance(2000);
  var warn = app.logs.warn.filter(function (l) { return l.indexOf("[inky] layout:") === 0; })[0];
  assert.ok(warn, "an overflowing column was not warned about");
  assert.match(warn, /overflow=40 .*OVERFLOW, bottom row is clipped/);
});

test("the report measures the horizontal axis too, and warns on it", function () {
  /* The assertion covered the vertical axis only for five rounds, and for five rounds the
     hourly strip clipped a chip through the middle of a glyph at the card's right edge in
     24-hour mode. #home itself must never scroll sideways: a card that runs off the right
     is as clipped as one that runs off the bottom, and there is no scrollbar and nobody
     standing there to swipe it. */
  var app = h.createApp({});
  layout(app, { scrollWidth: VIEW_W + 17 });
  app.WP.settings.set("clockHours", 24);
  app.advance(2000);
  var warn = app.logs.warn.filter(function (l) { return l.indexOf("[inky] layout:") === 0; })[0];
  assert.ok(warn, "content running off the right edge was not warned about");
  assert.match(warn, /overflowX=17 .*OVERFLOW, content runs off the right/);

  /* and a clean frame stays clean in the same mode */
  var ok = h.createApp({});
  layout(ok);
  ok.WP.settings.set("clockHours", 24);
  ok.advance(2000);
  assert.deepEqual(ok.logs.warn, []);
  assert.match(ok.logs.log.filter(function (l) {
    return l.indexOf("[inky] layout:") === 0;
  }).pop(), /overflow=0 overflowX=0/);
});

test("a surviving card may grow to at most 1.3x its intrinsic height", function () {
  /* Uncapped flex-grow handed the hidden widgets' whole height to whatever was left: at
     three hidden, the Weather card came out ~800 device px tall with ~250 px of dead black
     above its content. */
  var app = h.createApp({});
  var kids = layout(app);
  app.WP.relayoutHome();
  kids.forEach(function (n) {
    assert.equal(n.style.maxHeight, Math.round(CARD_H * 1.3) + "px",
      "growth cap is not 1.3x intrinsic height");
  });
});

test("no cap is applied before the first payload lands", function () {
  /* A cap measured against an empty card would clip it the moment the data arrived. */
  var app = h.createApp({ boot: false });
  app.boot();
  var kids = layout(app);
  app.WP.settings.set("seconds", true);      // triggers relayout, but nothing has published
  app.advance(1600);
  kids.forEach(function (n) {
    assert.equal(n.style.maxHeight, "", "a cap was applied before the cards had content");
  });
});

test("with no headroom to hand out, the cap is dropped entirely", function () {
  /* All eight widgets on leaves ~34 device px: the cap can only be a liability there. */
  var app = h.createApp({});
  var kids = layout(app, { cardHeight: Math.ceil(VIEW_H / 8) + 10 });   // fills the column
  app.WP.relayoutHome();
  kids.forEach(function (n) {
    assert.equal(n.style.maxHeight, "", "a cap was kept with no slack to distribute");
  });
});

test("slack of exactly zero counts as no headroom, not as a hair of headroom", function () {
  /* The boundary of `if (m.slack <= 0)`. Every other test here sits at slack=100 or at a
     comfortably negative overflow, so `<=` could be weakened to `<` and nothing noticed —
     yet slack=0 is the case the column actually converges on: the on-device measurement is
     34 px with all eight widgets on, and one downward burn-in nudge eats 12 of it. At
     exactly zero there is nothing to hand out, so applying a 1.3x cap can only clip. */
  var app = h.createApp({});
  var kids = app.qsa("#home > *").filter(function (n) { return n.id !== "empty"; });
  var cardH = 150;
  var home = app.$("home");
  home.clientHeight = kids.length * cardH;          // the cards fill the column exactly
  home.scrollHeight = home.clientHeight;
  home.setRect({ left: 0, top: 0, right: 800, bottom: home.clientHeight });
  var y = 0;
  kids.forEach(function (n) {
    n.offsetHeight = cardH;
    n.setRect({ left: 0, top: y, right: 800, bottom: y + cardH });
    y += cardH;
  });

  /* state the premise, so this test cannot quietly stop testing the boundary */
  app.advance(12500);
  var line = app.logs.log.filter(function (l) { return l.indexOf("[inky] layout:") === 0; })[0];
  assert.match(line, /slack=0px/, "this test is no longer sitting on the slack=0 boundary");

  app.WP.relayoutHome();
  kids.forEach(function (n) {
    assert.equal(n.style.maxHeight, "", "a growth cap was applied with zero slack");
  });
});

test("the column is never reflowed under a finger", function () {
  var app = h.createApp({});
  var kids = layout(app);
  app.WP.relayoutHome();
  var capped = kids[0].style.maxHeight;

  app.doc.dispatch(kids[0], "pointerdown", { pointerId: 2, clientX: 5, clientY: 5 });
  kids.forEach(function (n) { n.offsetHeight = 40; });
  app.WP.relayoutHome();
  assert.equal(kids[0].style.maxHeight, capped, "the column reflowed with a finger down");
});

test("a toast appears and clears itself", function () {
  var app = h.createApp({});
  app.WP.toast("hello wall");
  assert.equal(app.text("toast"), "hello wall");
  assert.equal(app.$("toast").classList.contains("show"), true);
  assert.equal(app.doc.body.classList.contains("toasting"), true,
    "the line underneath has to fade or the toast prints through it");

  app.advance(2000);
  assert.equal(app.$("toast").classList.contains("show"), false);
  assert.equal(app.doc.body.classList.contains("toasting"), false);
});

test("the status line carries a warn class only when it is a warning", function () {
  var app = h.createApp({});
  app.WP.status("all good");
  assert.equal(app.$("status").className, "status");
  app.WP.status("something is wrong", true);
  assert.equal(app.$("status").className, "status warn");
});

test("the page has no inline handlers and loads no remote script", function () {
  /* The WebView allowlist blocks off-origin navigation; the page itself must not be
     reaching out either. No CDNs, no frameworks — that is the whole premise. */
  var html = h.readAsset("index.html");
  assert.equal(/\son[a-z]+\s*=/.test(html), false, "index.html has an inline event handler");
  var srcs = (html.match(/src="([^"]+)"/g) || []).map(function (s) {
    return s.slice(5, -1);
  });
  assert.ok(srcs.length >= 3, "index.html loads no scripts at all");
  srcs.forEach(function (s) {
    assert.equal(/^https?:|^\/\//.test(s), false, "remote script: " + s);
    assert.equal(/^[a-z0-9.-]+\.js$/.test(s), true,
      "a script src that is not a flat local file: " + s);
  });
  assert.equal(/https?:\/\//.test(html), false, "index.html references a remote origin");
});

test("the only network origin the app talks to is Open-Meteo", function () {
  var app = h.createApp({ fetch: require("./lib/wx-fixture.js").serve() });
  return app.flush().then(function () {
    app.advance(60000);
    app.fetches.forEach(function (f) {
      assert.match(f.url, /^https:\/\/(api|air-quality-api)\.open-meteo\.com\//,
        "unexpected origin: " + f.url);
    });
  });
});
