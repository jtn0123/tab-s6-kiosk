/* Weather: the hour index every card reads from, and the rollover refetch that keeps the
   Now card and the hourly strip sourced from ONE payload. */

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./lib/harness.js");
var wx = require("./lib/wx-fixture.js");

function at(y, mo, d, hh, mm) { return new Date(y, mo, d, hh, mm || 0, 0, 0).getTime(); }

/* ---------------- nowIndex ---------------- */

test("nowIndex finds the hour we are inside", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now });
  var w = app.registry.weather;
  w.data = wx.build({ now: now });
  assert.equal(w.nowIndex(), 9, "09:30 is inside the 09:00 bucket");
});

test("nowIndex is inclusive of the start of the hour and exclusive of the next", function () {
  var day = [2025, 5, 10];
  var app = h.createApp({ now: at(day[0], day[1], day[2], 9, 0) });
  var w = app.registry.weather;
  w.data = wx.build({ now: at(day[0], day[1], day[2], 9, 0) });

  app.clock.set(at(day[0], day[1], day[2], 9, 0));
  assert.equal(w.nowIndex(), 9, "exactly on the hour belongs to that hour");

  app.clock.set(at(day[0], day[1], day[2], 9, 0) + 3599999);
  assert.equal(w.nowIndex(), 9, "one ms before the next hour is still this hour");

  app.clock.set(at(day[0], day[1], day[2], 10, 0));
  assert.equal(w.nowIndex(), 10, "the next hour starts the next bucket");

  app.clock.set(at(day[0], day[1], day[2], 9, 0) - 1);
  assert.equal(w.nowIndex(), 8);
});

test("nowIndex returns -1 when there is no data at all", function () {
  var app = h.createApp({});
  var w = app.registry.weather;
  w.data = null;
  assert.equal(w.nowIndex(), -1);
  w.data = {};
  assert.equal(w.nowIndex(), -1, "a payload with no hourly block");
  w.data = { hourly: {} };
  assert.equal(w.nowIndex(), -1, "an hourly block with no time array");
  w.data = { hourly: { time: [] } };
  assert.equal(w.nowIndex(), 0, "an empty time array falls back to the first slot");
});

test("nowIndex falls back to 0 when now is off the end of the array", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now });
  var w = app.registry.weather;
  w.data = wx.build({ now: now, hours: 6 });        // array ends at 05:00
  assert.equal(w.nowIndex(), 0, "a stale payload must still index somewhere valid");

  app.clock.set(at(2020, 0, 1, 0, 0));               // long before the array starts
  assert.equal(w.nowIndex(), 0);
});

test("the 24-hour strip window starts at the current hour and never runs off the end", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now });
  app.registry.weather.data = wx.build({ now: now });
  var win = app.own(app.registry.hourly.window24());
  assert.equal(win.length, 24);
  assert.equal(win[0], 9);
  assert.equal(win[23], 32);

  app.registry.weather.data = wx.build({ now: now, hours: 14 });
  var short = app.own(app.registry.hourly.window24());
  assert.equal(short.length, 5, "a 14-hour payload at 09:30 leaves five hours");
  assert.equal(short[short.length - 1], 13);
});

/* ---------------- the Now / NOW desync ---------------- */

test("REGRESSION: the Now card and the NOW chip agree across an hour rollover", function () {
  /* Observed live: "65°" on the Now card beside "NOW 66°" in the strip. The strip
     re-anchors itself the moment the wall clock crosses into a new hour (its own 15 s tick
     watches nowIndex), but the big Now temperature only changes when a fetch lands, so
     between a rollover and the next scheduled fetch — up to 15 minutes — the two cards
     showed two different current temperatures for the same instant. */
  var start = at(2025, 5, 10, 6, 59, 30) + 30000;   // 06:59:30
  var app = h.createApp({ now: start, fetch: wx.serve() });

  return app.flush().then(function () {
    var card = app.text("wx-temp");
    var chip = nowChip(app);
    assert.equal(card, chip, "card and strip disagreed before the rollover");
    assert.equal(card, wx.tempAt(6) + "°");

    app.advance(60000);                              // cross into 07:00
    return app.flush().then(function () {
      assert.equal(nowChip(app), wx.tempAt(7) + "°", "the strip did not re-anchor");
      assert.equal(app.text("wx-temp"), nowChip(app),
        "the Now card is still showing the previous hour's temperature");
    });
  });
});

function nowChip(app) {
  var chip = app.qs("#hourly .hr.now");
  assert.ok(chip, "the strip has no NOW chip");
  assert.equal(chip.querySelector(".hr-t").textContent, "Now");
  return chip.querySelector(".hr-d").textContent;
}

test("checkRollover refetches once per hour and never on the boot pass", function () {
  var app = h.createApp({ now: at(2025, 5, 10, 6, 30) });
  var w = app.registry.weather;
  var fetched = 0;
  w.fetch = function () { fetched++; };

  w.fetchedAt = 0;
  w.lastHour = -1;
  assert.equal(w.checkRollover(), false, "the boot pass must not double-fetch");
  assert.equal(fetched, 0);
  assert.equal(w.lastHour, 6, "it still records which hour we are in");

  w.fetchedAt = app.clock.now;
  assert.equal(w.checkRollover(), false, "same hour, nothing to do");
  assert.equal(fetched, 0);

  app.clock.set(at(2025, 5, 10, 7, 0));
  assert.equal(w.checkRollover(), true);
  assert.equal(fetched, 1);
  assert.equal(w.checkRollover(), false, "one refetch per rollover, not one per tick");
  assert.equal(fetched, 1);

  app.clock.set(at(2025, 5, 10, 8, 15));
  assert.equal(w.checkRollover(), true);
  assert.equal(fetched, 2);
});

test("the rollover tick is actually wired to a timer", function () {
  /* checkRollover being right is worth nothing if nothing calls it. */
  var app = h.createApp({ now: at(2025, 5, 10, 6, 59, 50) + 50000, fetch: wx.serve() });
  return app.flush().then(function () {
    var before = app.fetches.length;
    app.advance(20000);                              // crosses 07:00, one 15 s tick
    assert.ok(app.fetches.length > before, "crossing the hour did not trigger a refetch");
  });
});

/* ---------------- rendering from a payload ---------------- */

test("a live payload fills the Now card, the strip and the daily row", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now, fetch: wx.serve() });
  return app.flush().then(function () {
    assert.equal(app.text("wx-temp"), wx.tempAt(9) + "°");
    assert.equal(app.$("wx-badge").hidden, true, "fresh data is not stale");
    assert.equal(app.qsa("#hourly .hr").length, 24);
    assert.equal(app.qsa("#forecast .fc-day").length, 7, "all seven days the API returns");
    assert.equal(app.qs("#forecast .fc-name").textContent, "Today");
    assert.match(app.text("status"), /^Updated /);
  });
});

test("a failed fetch keeps the last reading on screen and badges it", function () {
  var now = at(2025, 5, 10, 9, 30);
  var cached = { t: now - 3600000, u: "fahrenheit", d: wx.build({ now: now - 3600000 }) };
  var app = h.createApp({
    now: now,
    storage: { "inky.wx.v2": JSON.stringify(cached) }
  });
  return app.flush().then(function () {
    assert.equal(app.$("wx-badge").hidden, false, "an offline panel must badge its data");
    assert.equal(app.text("wx-temp"), wx.tempAt(8) + "°", "the cached reading stays up");
    assert.match(app.text("status"), /Offline/);
    assert.deepEqual(app.logs.error, []);
  });
});

test("with no data at all the card says so instead of going blank", function () {
  var app = h.createApp({});
  return app.flush().then(function () {
    assert.match(app.text("status"), /Weather unavailable/);
    assert.equal(app.qs("#hourly").textContent, "waiting for forecast…");
  });
});

test("no location configured disables weather with an explicit message", function () {
  var cfg = h.defaultConfig();
  cfg.location = { name: "", latitude: null, longitude: null };
  var app = h.createApp({ config: cfg });
  assert.equal(app.text("wx-desc"), "No location set");
  assert.match(app.text("status"), /no location set/);
  assert.equal(app.fetches.length, 0, "must not call Open-Meteo without coordinates");
});

test("the request asks Open-Meteo for the units the panel is set to", function () {
  var app = h.createApp({ fetch: wx.serve() });
  return app.flush().then(function () {
    var url = app.fetches[0].url;
    assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
    assert.match(url, /temperature_unit=fahrenheit/);
    assert.match(url, /wind_speed_unit=mph/);
    assert.match(url, /precipitation_unit=inch/);
    assert.match(url, /timezone=auto/);
    assert.equal(/[?&]key=|token/.test(url), false, "no API key should ever be in the URL");

    app.WP.settings.set("units", "celsius");
    return app.flush().then(function () {
      var last = app.fetches[app.fetches.length - 1].url;
      assert.match(last, /temperature_unit=celsius/);
      assert.match(last, /wind_speed_unit=kmh/);
      assert.match(last, /precipitation_unit=mm/);
    });
  });
});

test("switching to 24-hour redraws the strip and the status line immediately", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now, fetch: wx.serve() });
  return app.flush().then(function () {
    var labels = app.qsa("#hourly .hr-t").map(function (n) { return n.textContent; });
    assert.equal(labels[1], "10a");
    app.WP.settings.set("clockHours", 24);
    var after = app.qsa("#hourly .hr-t").map(function (n) { return n.textContent; });
    assert.equal(after[0], "Now");
    assert.equal(after[1], "10:00", "the strip kept 12-hour labels under a 24-hour clock");
  });
});

test("the hourly panel opens on the hour that was tapped", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now, fetch: wx.serve() });
  return app.flush().then(function () {
    var chips = app.qsa("#hourly .hr");
    app.tap(chips[3]);                                 // four hours from now = 12:00
    assert.deepEqual(app.stack(), ["hourly"]);
    assert.equal(app.registry.hourly.sel, 12);
    var body = app.panelBody("hourly");
    assert.equal(body.querySelector(".big-time").textContent, wx.tempAt(12) + "°");
    assert.equal(app.qsa(".hrow", body).length, 24);
    assert.equal(app.qsa(".hrow.sel", body).length, 1);
  });
});

test("the daily panel opens on the day that was tapped", function () {
  var now = at(2025, 5, 10, 9, 30);
  var app = h.createApp({ now: now, fetch: wx.serve() });
  return app.flush().then(function () {
    app.tap(app.qsa("#forecast .fc-day")[2]);
    assert.deepEqual(app.stack(), ["daily"]);
    assert.equal(app.registry.daily.sel, 2);
    var body = app.panelBody("daily");
    assert.match(body.querySelector(".big-time").textContent, /^80°/);
    assert.equal(app.qsa(".chip.on", body).length, 1);
  });
});
