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
    if (aqi == null || isNaN(aqi)) return { label: "Unknown", cls: "aqi-na" };
    if (aqi <= 50) return { label: "Good", cls: "aqi-good" };
    if (aqi <= 100) return { label: "Moderate", cls: "aqi-mod" };
    if (aqi <= 150) return { label: "Unhealthy for sensitive groups", cls: "aqi-usg" };
    if (aqi <= 200) return { label: "Unhealthy", cls: "aqi-bad" };
    if (aqi <= 300) return { label: "Very unhealthy", cls: "aqi-vbad" };
    return { label: "Hazardous", cls: "aqi-haz" };
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
        chart = section("Next 24 hours",
          '<div class="aqi-spark ' + b.cls + '">' + WP.sparkline(vals, { w: 200, h: 36 }) + "</div>");
      }

      /* the ring is the AQI colour as a shape; the number beside it carries the value */
      var ring = '<svg class="wxi" viewBox="0 0 64 64"><circle cx="32" cy="32" r="21"'
        + ' fill="none" stroke="currentColor" stroke-width="9"/></svg>';
      body.innerHTML =
        ui.hero('<span class="' + b.cls + '">' + ring + "</span>",
          '<span class="' + b.cls + '">' + Math.round(cur.us_aqi) + "</span>", esc(b.label))
        + chart
        + section("Pollutants", statGrid([
            ["PM2.5", Math.round(cur.pm2_5) + "", "µg/m³"],
            ["PM10", Math.round(cur.pm10) + "", "µg/m³"],
            ["Ozone", Math.round(cur.ozone) + "", "µg/m³"],
            ["NO₂", Math.round(cur.nitrogen_dioxide) + "", "µg/m³"],
            ["SO₂", Math.round(cur.sulphur_dioxide) + "", "µg/m³"],
            ["CO", Math.round(cur.carbon_monoxide) + "", "µg/m³"]
          ], 3));
    }
  };

  air.band = band;
  WP.register(air);
})();
