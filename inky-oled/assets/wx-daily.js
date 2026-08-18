/* Wall panel dashboard — DAILY FORECAST.

   Seven days across the home card, and a per-day panel with hour-by-hour bars taken from
   the same hourly array the strip uses.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it). The plugin
   contract is unchanged and is documented in wx-ui.js.
*/

(function () {
  "use strict";

  var $ = WP.$, esc = WP.esc, fmt = WP.fmt;
  var ui = WP.ui;
  var statGrid = ui.statGrid, section = ui.section, hero = ui.hero;

  /* The forecast is fetched once and shared: this widget, the "now" card and the daily card
     all read the same payload rather than each hitting Open-Meteo. wx-weather.js is loaded
     before this file (index.html pins that order, and a test asserts it), so the plugin is
     already in the registry by the time this IIFE runs. */
  var weather = WP.registry.weather;

  var daily = {
    name: "daily",
    sel: 0,

    init: function () {
      var self = this;
      weather.onData(function () { self.render(); });
      WP.onAction("daily", function (act, arg) {
        if (act === "pick") { self.sel = parseInt(arg, 10); self.paintPanel(); }
      });
    },

    render: function () {
      var fc = $("forecast");
      if (!fc) return;
      var d = weather.data;
      if (!d || !d.daily) { fc.innerHTML = '<div class="muted">waiting for forecast…</div>'; return; }

      var day = d.daily;
      /* All 7 days the API returns: the card used to stop at 6 while its own detail panel
         offered 7, so the last day was unreachable from the home view. */
      var n = Math.min(day.time.length, 7);
      var html = "";
      for (var i = 0; i < n; i++) {
        var dt = new Date(day.time[i] + "T12:00:00");
        var info = WP.wmo(day.weather_code[i], false);
        var name = i === 0 ? "Today" : dt.toLocaleDateString(undefined, { weekday: "short" });
        html += '<button class="fc-day tappable" data-open="daily" data-arg="' + i + '"'
          + ' aria-label="' + esc(name + ", " + info.text + ", high "
              + fmt.deg(day.temperature_2m_max[i]) + ", low "
              + fmt.deg(day.temperature_2m_min[i])) + '">'
          + '<div class="fc-name">' + esc(name) + "</div>"
          + '<div class="fc-icon" aria-hidden="true">' + WP.wxIcon(day.weather_code[i], false) + "</div>"
          + '<div class="fc-hi">' + fmt.deg(day.temperature_2m_max[i]) + "</div>"
          + '<div class="fc-lo">' + fmt.deg(day.temperature_2m_min[i]) + "</div>"
          + "</button>";
      }
      fc.innerHTML = html;
    },

    onOpen: function (panel, arg) {
      this.panel = panel;
      var n = parseInt(arg, 10);
      this.sel = isNaN(n) ? 0 : n;
      this.paintPanel();
    },
    onClose: function () { this.panel = null; },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("daily");
      if (!panel) return;
      var body = WP.qs("[data-body]", panel);
      var d = weather.data;
      if (!d || !d.daily) { body.innerHTML = '<div class="muted">No forecast loaded yet.</div>'; return; }

      var day = d.daily, i = Math.min(this.sel, day.time.length - 1);
      var dt = new Date(day.time[i] + "T12:00:00");
      var info = WP.wmo(day.weather_code[i], false);
      WP.qs("[data-sub]", panel).textContent =
        dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

      /* day switcher across the top of the panel */
      var tabs = '<div class="chip-row" role="radiogroup" aria-label="Day">'
        + day.time.map(function (iso, k) {
          var dk = new Date(iso + "T12:00:00");
          return '<button class="chip tappable' + (k === i ? " on" : "") + '"'
            + ' role="radio" aria-checked="' + (k === i ? "true" : "false") + '"'
            + ' data-ns="daily" data-act="pick" data-arg="' + k + '">'
            + esc(k === 0 ? "Today" : dk.toLocaleDateString(undefined, { weekday: "short" }))
            + "</button>";
        }).join("") + "</div>";

      var sunrise = new Date(day.sunrise[i]), sunset = new Date(day.sunset[i]);

      /* hour-by-hour temperature bars for the selected day, straight from hourly[].

         Rebuilt, because the old version was the worst-reading element in the app:

           * It labelled a TIME axis with TEMPERATURES, one every three bars. Two adjacent
             ticks both read 90° while the bar between them was visibly taller than either
             — the labels were describing the bars they sat above, but they were positioned
             like axis ticks, so they read as a scale that contradicted the chart.
           * It had no time axis at all. There was markup for one, but the chart sat flush
             against the panel footer and the hour row was clipped away underneath it.
           * The bars were a solid accent fill covering ~6% of the screen — 54x the home
             view, and the largest bright area in an app whose own stylesheet says to avoid
             large bright fills on an OLED panel.

         Now: the axis along the bottom is TIME, every three hours, and it is the only
         repeating label. Temperature appears exactly twice, on the warmest and coldest
         bars, where a number is an annotation of that bar rather than a scale. The fill is
         dim with a bright cap (see .daybar-c in style.css), so the shape still reads from
         across a room at a fraction of the lit area. */
      var barsHtml = '<div class="muted">no hourly detail for this day</div>';
      if (d.hourly && d.hourly.time) {
        var iso = day.time[i];
        var idx = [];
        for (var k = 0; k < d.hourly.time.length; k++) {
          if (d.hourly.time[k].indexOf(iso) === 0) idx.push(k);
        }
        if (idx.length) {
          var temps = idx.map(function (k) { return d.hourly.temperature_2m[k]; });
          var lo = Math.min.apply(null, temps), hi = Math.max.apply(null, temps);
          var span = (hi - lo) || 1;
          var iHot = temps.indexOf(hi), iCold = temps.indexOf(lo);
          barsHtml = '<div class="daybars" role="img" aria-label="'
            + esc("hourly temperature through the day, " + fmt.deg(lo) + " to " + fmt.deg(hi))
            + '">'
            + idx.map(function (k, n) {
            var h = 14 + ((d.hourly.temperature_2m[k] - lo) / span) * 86;
            var peak = (n === iHot || n === iCold);
            return '<div class="daybar' + (peak ? " peak" : "") + '">'
              + '<div class="daybar-v">'
                + (peak ? fmt.deg(d.hourly.temperature_2m[k]) : "") + "</div>"
              + '<div class="daybar-c"><div style="height:' + h.toFixed(1) + '%"></div></div>'
              + '<div class="daybar-t">' + (n % 3 === 0
                  ? esc(fmt.hourLabel(new Date(d.hourly.time[k]))) : "") + "</div></div>";
          }).join("") + "</div>";
        }
      }

      WP.repaint(body, tabs
        + hero(WP.wxIcon(day.weather_code[i], false),
               fmt.deg(day.temperature_2m_max[i])
                 + ' <span class="dim">/ ' + fmt.deg(day.temperature_2m_min[i]) + "</span>",
               esc(info.text))

        /* Nine cells, three full rows. It was ten, which in a three-across grid left SUNSET
           alone on a fourth row under a hairline stopping at a third of the width. Wind and
           gusts are one fact about one day, so the gust figure moved onto the wind cell's
           second line beside the direction it blows from. */
        + section("Day", statGrid([
            ["Feels high", fmt.deg(day.apparent_temperature_max[i])],
            ["Feels low", fmt.deg(day.apparent_temperature_min[i])],
            ["Rain chance", Math.round(day.precipitation_probability_max[i] || 0) + "%"],
            ["Precip total", (Math.round((day.precipitation_sum[i] || 0) * 100) / 100)
              + " " + fmt.precipUnit()],
            ["Max wind", Math.round(day.wind_speed_10m_max[i]) + " " + fmt.speedUnit(),
              fmt.compass(day.wind_direction_10m_dominant[i]) + " · gusts "
                + Math.round(day.wind_gusts_10m_max[i]) + " " + fmt.speedUnit()],
            ["UV max", String(fmt.uv(day.uv_index_max[i]).n), fmt.uv(day.uv_index_max[i]).label],
            ["Daylight", esc(fmt.duration(day.daylight_duration[i] * 1000))],
            ["Sunrise", esc(fmt.clock(sunrise, false))],
            ["Sunset", esc(fmt.clock(sunset, false))]
          ], 3))
        + section("Hour by hour", barsHtml));
    }
  };

  WP.register(daily);
})();
