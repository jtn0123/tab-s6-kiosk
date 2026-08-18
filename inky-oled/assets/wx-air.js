/* Wall panel dashboard — AIR QUALITY.

   Open-Meteo's air-quality endpoint: same provider, same no-key deal, same CORS posture
   as the weather fetch, and it reuses the location already in config.js. The tile is the
   most colour-coded thing on the panel because AQI is the one number whose colour IS the
   standard: the EPA bands are green/yellow/orange/red/purple/maroon by definition, so the
   palette here follows the convention people already know from every AQI map.

   band() is pure and exported for the tests — the boundaries are the EPA breakpoints and
   an off-by-one at 50/51 or 100/101 would put the wrong colour on a health scale.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it).
*/

(function () {
  "use strict";

  var C = WP.C;
  var $ = WP.$, esc = WP.esc;
  var ui = WP.ui;
  var statGrid = ui.statGrid, section = ui.section;

  var CACHE = "inky.aqi.v1";

  function band(aqi) {
    if (aqi == null || isNaN(aqi)) return { label: "Unknown", cls: "band-na" };
    if (aqi <= 50) return { label: "Good", cls: "band-1" };
    if (aqi <= 100) return { label: "Moderate", cls: "band-2" };
    if (aqi <= 150) return { label: "Unhealthy for sensitive groups", cls: "band-3" };
    if (aqi <= 200) return { label: "Unhealthy", cls: "band-4" };
    if (aqi <= 300) return { label: "Very unhealthy", cls: "band-5" };
    return { label: "Hazardous", cls: "band-6" };
  }

  /* WHO 2021 air-quality guideline levels, in the ug/m3 the feed already reports (CO is the
     24-hour level). The panel used to print six pollutant figures with no scale of any kind
     beside them, so 98 and 6 looked like the same sort of fact and nothing said which of
     them was driving the 70 at the top of the screen. A figure over its guideline wears the
     ramp's "over" step and prints the guideline it passed; one at or under it stays plain.
     Two states, because that is how many the guideline defines — a six-step ramp here would
     be inventing bands the WHO does not publish. */
  var GUIDE = { pm2_5: 15, pm10: 45, ozone: 100, nitrogen_dioxide: 25,
                sulphur_dioxide: 40, carbon_monoxide: 4000 };

  function pollutant(label, key, cur) {
    var v = cur[key];
    if (v == null || isNaN(v)) return [label, "--"];
    var n = Math.round(v), g = GUIDE[key];
    return [label, n > g ? '<span class="band-3">' + n + "</span>" : String(n),
            (n > g ? "over " : "") + "WHO " + g + " µg/m³"];
  }

  var air = {
    name: "air",
    data: null,
    fetchedAt: 0,
    stale: false,
    panel: null,

    init: function () {
      var loc = C.location || {};
      if (loc.latitude == null || loc.longitude == null) {
        var sub = $("air-sub");
        if (sub) sub.textContent = "no location set";
        return;
      }
      var cached = WP.store.readJSON(CACHE, null);
      if (cached && cached.d) {
        this.data = cached.d; this.fetchedAt = cached.t || 0; this.stale = true;
        this.render();
      }
      this.fetch();
      setInterval(this.fetch.bind(this), 30 * 60 * 1000);
    },

    url: function () {
      var loc = C.location;
      return "https://air-quality-api.open-meteo.com/v1/air-quality"
        + "?latitude=" + encodeURIComponent(loc.latitude)
        + "&longitude=" + encodeURIComponent(loc.longitude)
        + "&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide"
        + "&hourly=us_aqi&forecast_days=2&timezone=auto";
    },

    fetch: function () {
      var self = this;
      fetch(this.url())
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (d) {
          self.data = d; self.fetchedAt = Date.now(); self.stale = false;
          WP.store.writeJSON(CACHE, { d: d, t: self.fetchedAt });
          self.render();
          if (self.panel) self.paintPanel();
        })
        .catch(function () {
          /* keep showing the cached reading; the tile marks itself stale */
          self.stale = true;
          self.render();
        });
    },

    render: function () {
      var big = $("air-big"), sub = $("air-sub");
      if (!big) return;
      var cur = this.data && this.data.current;
      if (!cur) { sub.textContent = "waiting for data…"; return; }
      var b = band(cur.us_aqi);
      big.innerHTML = '<span class="' + b.cls + '">' + Math.round(cur.us_aqi) + "</span>";
      /* The band alone. "Moderate · PM2.5 15" needed 146 px of the tile's 80 and printed
         "Moderate…", which is the ellipsis telling you the tile was designed for a width it
         does not have. The pollutant driving the index belongs on the panel, where there is
         room to say which one it is. */
      sub.textContent = (this.stale ? "stale · " : "") + b.label;
    },

    onOpen: function (panel) { this.panel = panel; this.paintPanel(); },
    onClose: function () { this.panel = null; },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("air");
      if (!panel) return;
      var body = WP.qs("[data-body]", panel);
      var d = this.data;
      if (!d || !d.current) {
        WP.qs("[data-sub]", panel).textContent = "Air quality";
        body.innerHTML = '<div class="muted">No reading yet.</div>';
        return;
      }
      var cur = d.current;
      var b = band(cur.us_aqi);
      WP.qs("[data-sub]", panel).textContent = "US AQI · " + b.label
        + (this.stale ? " · stale" : "");

      /* next 24 h of forecast AQI, from now */
      var chart = "";
      if (d.hourly && d.hourly.us_aqi && d.hourly.time) {
        var now = Date.now(), start = 0;
        for (var i = 0; i < d.hourly.time.length; i++) {
          if (new Date(d.hourly.time[i]).getTime() >= now) { start = Math.max(0, i - 1); break; }
        }
        var vals = d.hourly.us_aqi.slice(start, start + 24);
        /* The same four labels the sensor trace and the hourly curve carry. This was a bare
           squiggle: no y-scale, no ticks, no annotation, one swipe away from a chart that
           had all three, so the only thing it said was "something goes up and down". */
        var lo = Math.round(Math.min.apply(null, vals));
        var hi = Math.round(Math.max.apply(null, vals));
        chart = section("Next 24 hours",
          ui.plot('<div class="aqi-spark ' + b.cls + '">'
                  + WP.sparkline(vals, { w: 200, h: 36 }) + "</div>",
                  String(hi), String(lo), "now", "+24 h"));
      }

      /* A GAUGE, not a bullet point. It was a small hollow ring — no arc, no track, no
         scale, no relation to 61-of-300 — sitting where a gauge would sit and reading as
         decoration beside the number it was supposed to picture. It is a 240° arc now: the
         track is the whole US AQI range a person ever sees (0-300; anything above that is
         hazardous and pins it full) and the coloured sweep is where today sits on it, in
         the band's own colour. The number stays beside it, because an arc is a shape and a
         shape is not a reading. */
      var SWEEP = 100.5;        // the arc's length, 2*PI*24 * 240/360
      var frac = Math.max(0, Math.min(1, (cur.us_aqi || 0) / 300));
      var ring = '<svg class="wxi" viewBox="0 0 64 64">'
        + '<path class="aqi-track" d="M 11.2 44 A 24 24 0 1 1 52.8 44"/>'
        + '<path class="aqi-arc" d="M 11.2 44 A 24 24 0 1 1 52.8 44" stroke-dasharray="'
        + (frac * SWEEP).toFixed(1) + " " + SWEEP + '"/></svg>';
      body.innerHTML =
        ui.hero('<span class="' + b.cls + '">' + ring + "</span>",
          '<span class="' + b.cls + '">' + Math.round(cur.us_aqi) + "</span>", esc(b.label))
        + chart
        /* Each cell used to be a three-line stack — label / number / µg/m³ — which put the
           unit on its own line six times over, in the smallest and dimmest tier in the app,
           and turned six fields into eighteen lines. The unit now rides on the guideline
           line, where it says what the figure is measured in AND what it is measured
           against in one breath: "WHO 15 µg/m³".

           It is deliberately not in the section heading, which is where it went first: the
           label recipe upper-cases every heading, and "µg/m³" upper-cased is "MG/M³" — the
           panel printed milligrams, a thousand-fold error in a health figure, because of a
           text-transform. */
        + section("Pollutants", statGrid([
            pollutant("PM2.5", "pm2_5", cur),
            pollutant("PM10", "pm10", cur),
            pollutant("Ozone", "ozone", cur),
            pollutant("NO₂", "nitrogen_dioxide", cur),
            pollutant("SO₂", "sulphur_dioxide", cur),
            pollutant("CO", "carbon_monoxide", cur)
          ], 3));
    }
  };

  air.band = band;
  WP.register(air);
})();
