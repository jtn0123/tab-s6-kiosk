/* Home Assistant tiles: the duty-cycle arithmetic and the demo simulator's physics. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");

function boot(opts) { return h.createApp(opts || {}); }
function lamp(app) { return app.registry.sensors.find("light.living_room_lamp"); }

/* ---------------- duty cycle ---------------- */

test("duty cycle is time-weighted, not a mean of samples", function () {
  /* A toggle records an extra off-grid sample the instant it is pressed. An unweighted mean
     would count that instant as heavily as a 30 s interval. */
  var s = boot().registry.sensors;
  var t = 1000000;
  var hist = [
    { t: t, v: 1 },                // on...
    { t: t + 1, v: 0 },            // ...switched off 1 ms later, recorded off-grid
    { t: t + 30000, v: 0 },
    { t: t + 90000, v: 0 }
  ];
  var duty = s.duty(hist);
  assert.ok(Math.abs(duty - 1 / 90000) < 1e-9,
    "on for 1 ms of 90 s should be ~0% duty, got " + (duty * 100).toFixed(2) + "%");

  var unweighted = hist.filter(function (p) { return p.v >= 0.5; }).length / hist.length;
  assert.equal(Math.round(unweighted * 100), 25,
    "a mean of samples would call this 25% — the fixture can tell the formulas apart");
});

test("duty cycle uses the value at the START of each interval", function () {
  var s = boot().registry.sensors;
  var t = 0;
  /* on at t=0, switched off at t=100: the first 100 ms count as on */
  assert.equal(s.duty([{ t: t, v: 1 }, { t: t + 100, v: 0 }]), 1);
  assert.equal(s.duty([{ t: t, v: 0 }, { t: t + 100, v: 1 }]), 0);
});

test("duty cycle degrades safely on thin or broken history", function () {
  var s = boot().registry.sensors;
  assert.equal(s.duty(null), null);
  assert.equal(s.duty([]), null);
  assert.equal(s.duty([{ t: 1, v: 1 }]), null, "one sample spans no time");
  assert.equal(s.duty([{ t: 5, v: 1 }, { t: 5, v: 0 }]), null, "zero-length intervals");
});

test("duty cycle is bounded and matches an all-on / all-off series", function () {
  var s = boot().registry.sensors;
  var on = [], off = [];
  for (var i = 0; i < 20; i++) {
    on.push({ t: i * 30000, v: 1 });
    off.push({ t: i * 30000, v: 0 });
  }
  assert.equal(s.duty(on), 1);
  assert.equal(s.duty(off), 0);
});

test("REGRESSION: the panel's duty figures agree with the state it shows", function () {
  /* The seeded history used to be filled with the entity's *current* state, so the panel
     contradicted itself for two hours after any toggle: "State now: Off" beside
     "On: 100% of window". */
  var app = boot();
  app.WP.panels.open("sensors");
  var e = lamp(app);
  app.registry.sensors.sel = e.id;

  [true, false].forEach(function (want) {
    if (e.on !== want) app.registry.sensors.toggle(e.id);
    app.registry.sensors.paintPanel();
    var stats = readStats(app.panelBody("sensors"));
    assert.equal(stats["State now"], want ? "On" : "Off");

    var last = e.hist[e.hist.length - 1];
    assert.equal(last.v >= 0.5, want, "the newest sample disagrees with the tile");

    var duty = app.registry.sensors.duty(e.hist);
    var pct = Math.round(duty * 100);
    assert.equal(stats["On"], pct + "% of window");
    assert.equal(stats["Off"], (100 - pct) + "% of window");
    assert.ok(pct > 0 && pct < 100,
      "a seeded past that is 0% or 100% is the bug this test exists for (got " + pct + "%)");
  });
  app.WP.panels.closeAll();
});

function readStats(body) {
  var out = {};
  body.querySelectorAll(".stat").forEach(function (st) {
    out[st.querySelector(".stat-k").textContent] = st.querySelector(".stat-v").textContent;
  });
  return out;
}

test("lastChange finds the most recent edge and nothing else", function () {
  var s = boot().registry.sensors;
  var hist = [
    { t: 100, v: 0 }, { t: 200, v: 1 }, { t: 300, v: 1 },
    { t: 400, v: 0 }, { t: 500, v: 0 }
  ];
  assert.equal(s.lastChange(hist), 400);
  assert.equal(s.lastChange([{ t: 1, v: 1 }, { t: 2, v: 1 }]), null, "a flat series has no edge");
  assert.equal(s.lastChange([]), null);
});

/* ---------------- the simulator ---------------- */

test("mean reversion is a proper decay: bounded, and slower for a larger tau", function () {
  var s = boot().registry.sensors;
  var room = { tau: 900000 };        // a room has thermal mass
  var power = { tau: 60000 };        // household load follows in seconds

  [room, power].forEach(function (def) {
    [1, 5000, 30000, 900000].forEach(function (dt) {
      var k = s.reversion(def, dt);
      assert.ok(k > 0 && k < 1, "reversion out of (0,1): " + k);
    });
  });
  assert.ok(s.reversion(room, 5000) < s.reversion(power, 5000),
    "a bigger time constant must react more slowly");
  assert.ok(s.reversion(room, 5000) < s.reversion(room, 30000),
    "a longer step must close more of the gap");
  /* one time constant closes 1 - 1/e of the gap */
  assert.ok(Math.abs(s.reversion(room, 900000) - (1 - 1 / Math.E)) < 1e-9);
});

test("the noise kick scales as sqrt(dt), so a 30 s seed matches a 5 s step", function () {
  /* Otherwise the seeded past and the live trace have a visible seam where one hands over. */
  var s = boot().registry.sensors;
  var def = { noise: 0.1 };
  var n5 = s.noiseFor(def, 5000);
  var n30 = s.noiseFor(def, 30000);
  assert.ok(Math.abs(n5 - 0.1) < 1e-12, "the 5 s step is the reference kick");
  assert.ok(Math.abs(n30 / n5 - Math.sqrt(6)) < 1e-9, "noise did not scale as sqrt(dt)");
});

test("a single simulation step never moves further than tau allows", function () {
  /* With the random kick pinned to its maximum, the step is still bounded by
     gap * k + noise. A step bigger than that means the model is not the model. */
  var app = boot({ random: function () { return 1; } });      // worst-case kick, every time
  var s = app.registry.sensors;

  s.ents.filter(function (e) { return e.kind === "numeric"; }).forEach(function (e) {
    for (var i = 0; i < 40; i++) {
      var before = e.value;
      var tgt = s.target(e.def, new Date(app.clock.now), s.flags());
      var bound = Math.abs(tgt - before) * s.reversion(e.def, s.tickMs)
        + s.noiseFor(e.def, s.tickMs) + 1e-9;
      app.advance(s.tickMs);
      assert.ok(Math.abs(e.value - before) <= bound,
        e.id + " moved " + (e.value - before).toFixed(4) + ", bound " + bound.toFixed(4));
    }
  });
});

test("simulated values stay inside their declared range forever", function () {
  var app = boot({ random: function () { return Math.random(); } });
  var s = app.registry.sensors;
  app.advance(3 * 3600000);                                    // three hours of ticks
  s.ents.filter(function (e) { return e.kind === "numeric"; }).forEach(function (e) {
    assert.ok(e.value >= e.def.min && e.value <= e.def.max,
      e.id + " left its range at " + e.value);
    e.hist.forEach(function (p) {
      assert.ok(p.v >= e.def.min && p.v <= e.def.max, e.id + " history left its range");
    });
  });
});

test("the model reverts toward its target when the noise is switched off", function () {
  var app = boot({ random: function () { return 0.5; } });     // kick of exactly zero
  var s = app.registry.sensors;
  var e = s.find("sensor.living_room_co2");
  var tgt = s.target(e.def, new Date(app.clock.now), s.flags());
  e.value = e.def.max;                                          // start far away
  var gap0 = Math.abs(e.value - tgt);

  app.advance(s.tickMs * 20);
  var gap1 = Math.abs(e.value - s.target(e.def, new Date(app.clock.now), s.flags()));
  assert.ok(gap1 < gap0, "the value did not move toward its target");
  assert.ok(e.value <= e.def.max, "and it never overshoots its ceiling");
});

test("switching the lamp on really does warm the living room", function () {
  var app = boot();
  var s = app.registry.sensors;
  var def = s.find("sensor.living_room_temperature").def;
  var when = new Date(app.clock.now);
  var cold = s.target(def, when, { lamp: false, fan: false, door: false });
  var warm = s.target(def, when, { lamp: true, fan: false, door: false });
  assert.ok(warm > cold, "the lamp has no effect on the room");
  assert.ok(Math.abs((warm - cold) - 1.4) < 1e-9);

  var power = s.find("sensor.house_power").def;
  assert.ok(s.target(power, when, { lamp: true, fan: true }) >
            s.target(power, when, { lamp: false, fan: false }), "switches should draw watts");
});

test("the daily curve peaks near the entity's declared phase", function () {
  var s = boot().registry.sensors;
  var def = s.find("sensor.outside_temperature").def;
  var best = -1, bestV = -Infinity;
  for (var hour = 0; hour < 24; hour++) {
    var v = s.target(def, new Date(2025, 5, 10, hour, 0), {});
    if (v > bestV) { bestV = v; best = hour; }
  }
  assert.ok(Math.abs(best - def.phase) <= 1, "peak at " + best + ", phase " + def.phase);
});

test("the seeded history spans two hours and is deterministic", function () {
  var a = boot(), b = boot();
  var ea = a.registry.sensors.find("sensor.living_room_temperature");
  var eb = b.registry.sensors.find("sensor.living_room_temperature");
  assert.equal(ea.hist.length, eb.hist.length);
  assert.ok(ea.hist.length >= 240, "two hours at 30 s is 241 samples, got " + ea.hist.length);
  var span = ea.hist[ea.hist.length - 1].t - ea.hist[0].t;
  assert.ok(Math.abs(span - 7200000) < 60000, "history span was " + span + " ms");
  ea.hist.forEach(function (p, i) {
    assert.ok(Math.abs(p.v - eb.hist[i].v) < 1e-12, "seeded history is not deterministic");
  });
});

test("the seeded switch history contains real runs, not one flat line", function () {
  var app = boot();
  var e = lamp(app);
  var edges = 0;
  for (var i = 1; i < e.hist.length; i++) {
    if ((e.hist[i].v >= 0.5) !== (e.hist[i - 1].v >= 0.5)) edges++;
  }
  assert.ok(edges >= 1, "the lamp never changed state in two hours of synthetic past");
  assert.equal(e.hist[e.hist.length - 1].v >= 0.5, e.on,
    "the seeded past must join the present without an invented step");
});

test("history is trimmed by age, not by sample count", function () {
  /* The poll interval is configurable, so a fixed cap would mean a different window for
     every refreshSeconds while the panel still calls it "Last 2 hours". */
  var app = boot();
  var s = app.registry.sensors;
  var e = s.find("sensor.house_power");
  app.advance(3 * 3600000);
  var span = e.hist[e.hist.length - 1].t - e.hist[0].t;
  assert.ok(span <= 7200000 + 60000, "window grew to " + span + " ms");
  assert.ok(e.hist.length <= 800);
});

test("a toggle records its edge immediately rather than up to 30 s late", function () {
  var app = boot();
  var s = app.registry.sensors;
  var e = lamp(app);
  var before = e.on;
  var n = e.hist.length;
  s.toggle(e.id);
  assert.equal(e.on, !before);
  assert.equal(e.hist.length, n + 1);
  assert.equal(e.hist[e.hist.length - 1].t, app.clock.now);
  assert.equal(e.hist[e.hist.length - 1].v, e.on ? 1 : 0);
  assert.equal(app.text("toast").indexOf("Lamp") === 0, true);
});

test("a toggle survives a reload", function () {
  var first = boot();
  var was = lamp(first).on;
  first.registry.sensors.toggle("light.living_room_lamp");
  var second = boot({ storage: first.storage.data });
  assert.equal(lamp(second).on, !was, "the lamp forgot its state across a reload");
});

test("tapping a switch tile toggles it; tapping a reading opens the panel", function () {
  var app = boot();
  var tiles = app.qsa("#sensors .sensor");
  var swTile = tiles.filter(function (t) { return t.getAttribute("data-act") === "toggle"; })[0];
  var reading = tiles.filter(function (t) { return t.getAttribute("data-open"); })[0];

  var e = app.registry.sensors.find(swTile.getAttribute("data-arg"));
  var before = e.on;
  app.tap(swTile);
  assert.equal(e.on, !before);
  assert.deepEqual(app.stack(), [], "a toggle must not open a panel");

  app.tap(reading);
  assert.deepEqual(app.stack(), ["sensors"]);
  assert.equal(app.registry.sensors.sel, reading.getAttribute("data-arg"));
});

test("the tile value has a fixed width so the column does not jitter", function () {
  /* Math.round dropped the trailing zero, so the column flickered 72 / 71.9 / 72.1. */
  var app = boot();
  var s = app.registry.sensors;
  var e = s.find("sensor.living_room_temperature");
  e.value = 72;
  assert.equal(s.display(e), "72.0");
  e.value = 71.94;
  assert.equal(s.display(e), "71.9");
  var co2 = s.find("sensor.living_room_co2");
  co2.value = 640.4;
  assert.equal(s.display(co2), "640", "ppm has no decimals");
});

test("demo temperatures follow the unit setting", function () {
  var app = boot();
  var s = app.registry.sensors;
  var e = s.find("sensor.living_room_temperature");
  e.value = 72;
  assert.equal(s.display(e), "72.0");
  assert.equal(s.outUnit(e), "°F");

  app.WP.settings.set("units", "celsius");
  assert.equal(s.outUnit(e), "°C");
  assert.ok(Math.abs(Number(s.display(e)) - 22.2) < 0.05, "got " + s.display(e));

  /* a non-temperature entity is not converted */
  var co2 = s.find("sensor.living_room_co2");
  assert.equal(s.outUnit(co2), "ppm");
});

test("the demo badge says demo and the panel says why", function () {
  var app = boot();
  assert.equal(app.text("ha-badge"), "demo");
  app.WP.panels.open("sensors");
  assert.match(app.qs('[data-panel="sensors"] [data-sub]').textContent, /DEMO/);
  assert.match(app.panelBody("sensors").textContent, /Simulated home/);
});

test("live mode is entered only with enabled + baseUrl + token", function () {
  function mode(ha) {
    var cfg = h.defaultConfig();
    cfg.homeAssistant = ha;
    return h.createApp({ config: cfg }).registry.sensors.mode;
  }
  var base = { baseUrl: "http://ha.invalid:8123", token: "t0ken", entities: [] };
  assert.equal(mode(Object.assign({ enabled: true }, base)), "live");
  assert.equal(mode(Object.assign({ enabled: false }, base)), "demo");
  assert.equal(mode({ enabled: true, baseUrl: "", token: "t0ken" }), "demo");
  assert.equal(mode({ enabled: true, baseUrl: "http://ha.invalid:8123", token: "" }), "demo");
  assert.equal(mode({}), "demo");
});

test("the live poll interval is configurable but floored at 5 s", function () {
  /* A mistyped 0 must not turn the panel into a request loop against somebody's HA box. */
  function pollMs(refreshSeconds) {
    var cfg = h.defaultConfig();
    cfg.homeAssistant = {
      enabled: true, baseUrl: "http://ha.invalid:8123", token: "t0ken",
      refreshSeconds: refreshSeconds, entities: []
    };
    return h.createApp({ config: cfg }).registry.sensors.livePollMs;
  }
  assert.equal(pollMs(60), 60000);
  assert.equal(pollMs(15), 15000);
  assert.equal(pollMs(5), 5000);
  assert.equal(pollMs(1), 5000, "1 s would hammer somebody's HA box");
  assert.equal(pollMs(-30), 5000, "a negative interval must not become a request loop");
  assert.equal(pollMs(0), 60000, "0 reads as 'not set' and falls back to the default");
  assert.equal(pollMs(undefined), 60000);
  assert.equal(pollMs("30"), 30000, "a string from a hand-edited config still works");
});
