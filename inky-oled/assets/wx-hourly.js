/* Wall panel dashboard — HOURLY FORECAST.

   Home card is a horizontally scrollable 24-hour strip; every hour is tappable and opens
   the panel focused on that hour.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it). The plugin
   contract is unchanged and is documented in wx-ui.js.
*/

(function () {
  "use strict";

  var $ = WP.$, esc = WP.esc, fmt = WP.fmt, S = WP.settings;
  var ui = WP.ui;
  var statGrid = ui.statGrid, section = ui.section, hero = ui.hero;

  /* The forecast is fetched once and shared: this widget, the "now" card and the daily card
     all read the same payload rather than each hitting Open-Meteo. wx-weather.js is loaded
     before this file (index.html pins that order, and a test asserts it), so the plugin is
     already in the registry by the time this IIFE runs. */
  var weather = WP.registry.weather;

  var hourly = {
    name: "hourly",
    sel: 0,
    lastStripTouch: 0,
    lastNow: -1,
    REANCHOR_MS: 45000,

    init: function () {
      var self = this;
      weather.onData(function () { self.render(); });

      /* The strip was wired to the weather fetch and to nothing else, so both of the things
         that make its labels wrong went uncorrected for up to 15 minutes: a 12/24h flip
         (the status line followed immediately while the chips still read 15:00 16:00 …) and
         the hour rolling over (the chip badged NOW kept pointing at the previous hour, with
         that hour's temperature). Neither needs new data — the payload already covers 24 h
         — only a redraw, so it is driven off the setting and off a cheap tick that watches
         which hour we are inside. Skipped while a finger is down: rebuilding the strip
         mid-press moves the chip out from under the tap. */
      S.onChange(function (k) {
        if (k === "clockHours" || k === "units" || k === "*") self.render();
      });
      setInterval(function () {
        if (WP.touching()) return;
        if (weather.nowIndex() !== self.lastNow) self.render();
      }, 15000);

      WP.onAction("hourly", function (act, arg) {
        /* no re-scroll on pick: the row the user just tapped is by definition on screen,
           and yanking the list under their finger would feel broken */
        if (act === "pick") { self.sel = parseInt(arg, 10); self.paintPanel(false); }
      });

      /* The strip is index 0 = now, so "scrolled to the end" means the panel is showing a
         window that has nothing to do with the present. Left alone it stayed there
         forever — a wall panel someone swiped past on Tuesday still showed 5P-11P on
         Thursday. Snap back to NOW once nobody has touched it for a while. */
      var box = $("hourly");
      if (box) {
        box.addEventListener("scroll", function () { self.lastStripTouch = Date.now(); }, false);
        setInterval(function () {
          if (!box.scrollLeft || WP.touching()) return;
          if (Date.now() - self.lastStripTouch < self.REANCHOR_MS) return;
          self.lastStripTouch = Date.now();      // don't fight the smooth scroll we start
          try { box.scrollTo({ left: 0, behavior: "smooth" }); }
          catch (e) { box.scrollLeft = 0; }
        }, 5000);
      }
    },

    /* the 24 indices starting at the current hour */
    window24: function () {
      var d = weather.data;
      if (!d || !d.hourly) return [];
      var start = Math.max(0, weather.nowIndex());
      var out = [];
      for (var i = start; i < Math.min(start + 24, d.hourly.time.length); i++) out.push(i);
      return out;
    },

    render: function () {
      var box = $("hourly");
      if (!box) return;
      var d = weather.data;
      if (!d || !d.hourly) { box.innerHTML = '<div class="muted">waiting for forecast…</div>'; return; }

      var h = d.hourly, now = weather.nowIndex();
      this.lastNow = now;                 // what the hour tick above compares against
      box.innerHTML = this.window24().map(function (i) {
        var t = new Date(h.time[i]);
        var info = WP.wmo(h.weather_code[i], h.is_day && h.is_day[i] === 0);
        var pop = h.precipitation_probability ? Math.round(h.precipitation_probability[i]) : 0;
        var when = i === now ? "Now" : fmt.hourLabel(t);
        /* The chip is four stacked fragments — "3P", a glyph, "90°", "0%" — which a screen
           reader would read as four unrelated strings with a symbol in the middle. One
           spoken sentence instead, and the glyph is hidden because info.text already says
           what it means. */
        return '<button class="hr tappable' + (i === now ? " now" : "") + '"'
          + ' data-open="hourly" data-arg="' + i + '"'
          + ' aria-label="' + esc(when + ", " + info.text + ", "
              + fmt.deg(h.temperature_2m[i]) + ", " + pop + "% chance of rain") + '">'
          + '<div class="hr-t">' + esc(when) + "</div>"
          + '<div class="hr-i" aria-hidden="true">' + WP.wxIcon(h.weather_code[i], h.is_day && h.is_day[i] === 0) + "</div>"
          + '<div class="hr-d">' + fmt.deg(h.temperature_2m[i]) + "</div>"
          + '<div class="hr-p' + (pop >= 30 ? " wet" : "") + '">' + pop + "%</div>"
          + "</button>";
      }).join("");
    },

    onOpen: function (panel, arg) {
      this.panel = panel;
      var n = parseInt(arg, 10);
      this.sel = isNaN(n) ? Math.max(0, weather.nowIndex()) : n;
      this.paintPanel(true);
    },
    onClose: function () { this.panel = null; },


    /* The InkyPi-style overview: one SVG, temperature as a line whose colour follows its
       height (a vertical gradient in user space — peaks literally read warm, valleys
       cool), rain probability as blue bars on the baseline. Decorative by contract
       (aria-hidden): every number in it is also in the pickable list below, which is the
       accessible surface.

       The hour ticks and the hi/lo callouts are HTML positioned over the chart, not SVG
       <text>: text in a scaling viewBox would need its own font-size, and the design
       system's one hard rule is that no size is authored outside the ramp. */
    chart: function (h, list, sel) {
      var W = 320, H = 104;
      var L = 8, R = 312, T = 14, B = 68;         // temp plot area
      var barBase = 100, barMax = 24;             // precip bars
      var temps = list.map(function (k) { return h.temperature_2m[k]; });
      var lo = Math.min.apply(null, temps), hi = Math.max.apply(null, temps);
      var span = (hi - lo) || 1;
      var step = (R - L) / (list.length - 1);

      function xy(n) {
        var x = L + n * step;
        var y = B - ((temps[n] - lo) / span) * (B - T);
        return [x, y];
      }
      function pctX(x) { return (x / W * 100).toFixed(2) + "%"; }
      function pctY(y) { return (y / H * 100).toFixed(2) + "%"; }

      var pts = list.map(function (_, n) { return xy(n); });
      var line = pts.map(function (p2, n) {
        return (n ? "L " : "M ") + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
      }).join(" ");
      var area = line + " L " + R + " " + (B + 2) + " L " + L + " " + (B + 2) + " Z";

      var bars = "", ticks = "", marks = "";
      var bw = step * 0.5;
      var now = weather.nowIndex();
      list.forEach(function (k, n) {
        var pop = h.precipitation_probability ? (h.precipitation_probability[k] || 0) : 0;
        if (pop > 0) {
          var bh = (pop / 100) * barMax;
          bars += '<rect x="' + (L + n * step - bw / 2).toFixed(1) + '" y="' + (barBase - bh).toFixed(1)
            + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="1"/>';
        }
        if (n % 3 === 0) {
          var tt = new Date(h.time[k]);
          ticks += '<span style="left:' + pctX(L + n * step) + '">'
            + esc(k === now ? "Now" : fmt.hourLabel(tt)) + "</span>";
        }
      });

      /* dot + hairline on the selected hour so the chart and the list agree on focus */
      var si = list.indexOf(sel);
      if (si >= 0) {
        var sp = pts[si];
        marks = '<line x1="' + sp[0].toFixed(1) + '" y1="' + T + '" x2="' + sp[0].toFixed(1)
          + '" y2="' + barBase + '" stroke="var(--card-line2)" stroke-width="1"/>'
          + '<circle cx="' + sp[0].toFixed(1) + '" cy="' + sp[1].toFixed(1)
          + '" r="3.5" fill="var(--fg)"/>';
      }

      /* hi / lo callouts pinned to the curve's own extremes, not an axis */
      var hiN = temps.indexOf(hi), loN = temps.indexOf(lo);
      var labels = '<span class="hc-hi" style="left:' + pctX(pts[hiN][0])
        + ";top:" + pctY(pts[hiN][1] - 5) + '">' + Math.round(hi) + "&#176;</span>"
        + '<span class="hc-lo" style="left:' + pctX(pts[loN][0])
        + ";top:" + pctY(pts[loN][1] + 5) + '">' + Math.round(lo) + "&#176;</span>";

      return '<div class="hchart-wrap" aria-hidden="true"><svg class="hchart" viewBox="0 0 ' + W + " " + H + '">'
        + '<defs><linearGradient id="hc-t" x1="0" y1="' + T + '" x2="0" y2="' + B
        + '" gradientUnits="userSpaceOnUse">'
        + '<stop offset="0" stop-color="var(--temp-hot)"/>'
        + '<stop offset="0.55" stop-color="var(--temp-warm)"/>'
        + '<stop offset="1" stop-color="var(--temp-cold)"/></linearGradient>'
        + '<linearGradient id="hc-a" x1="0" y1="' + T + '" x2="0" y2="' + B
        + '" gradientUnits="userSpaceOnUse">'
        + '<stop offset="0" stop-color="var(--temp-warm)" stop-opacity="0.18"/>'
        + '<stop offset="1" stop-color="var(--temp-cold)" stop-opacity="0.02"/></linearGradient></defs>'
        + marks
        + '<g class="hc-bars">' + bars + "</g>"
        + '<path d="' + area + '" fill="url(#hc-a)"/>'
        + '<path d="' + line + '" fill="none" stroke="url(#hc-t)" stroke-width="2.5"'
        + ' stroke-linecap="round" stroke-linejoin="round"/>'
        + "</svg>"
        + labels
        + '<div class="hc-ticks">' + ticks + "</div></div>";
    },

    paintPanel: function (scrollToSel) {
      var panel = this.panel || WP.panels.el("hourly");
      if (!panel) return;
      var body = WP.qs("[data-body]", panel);
      var d = weather.data;
      if (!d || !d.hourly) {
        body.innerHTML = '<div class="muted">No forecast loaded yet.</div>';
        return;
      }
      var h = d.hourly, i = this.sel, list = this.window24();
      var t = new Date(h.time[i]);
      var info = WP.wmo(h.weather_code[i], h.is_day && h.is_day[i] === 0);

      WP.qs("[data-sub]", panel).textContent =
        t.toLocaleDateString(undefined, { weekday: "long" }) + " · " + fmt.clock(t, false);

      /* readout for the selected hour, then the full pickable list underneath */
      var readout = hero(WP.wxIcon(h.weather_code[i], h.is_day && h.is_day[i] === 0),
            fmt.deg(h.temperature_2m[i]),
            esc(info.text) + " · feels " + fmt.deg(h.apparent_temperature[i]))
        + statGrid([
            ["Rain chance", (h.precipitation_probability
              ? Math.round(h.precipitation_probability[i]) : 0) + "%"],
            ["Precip", (Math.round((h.precipitation[i] || 0) * 100) / 100) + " " + fmt.precipUnit()],
            ["Humidity", Math.round(h.relative_humidity_2m[i]) + "%"],
            ["Dew point", fmt.deg(h.dew_point_2m[i])],
            ["Wind", Math.round(h.wind_speed_10m[i]) + " " + fmt.speedUnit(),
              fmt.compass(h.wind_direction_10m[i])],
            ["UV index", String(fmt.uv(h.uv_index[i]).n), fmt.uv(h.uv_index[i]).label],
            ["Cloud", Math.round(h.cloud_cover[i]) + "%"],
            ["Visibility", fmt.distance(h.visibility ? h.visibility[i] : null)]
          ], 3);

      /* temperature range across the window drives the inline bar width so the list
         reads as a chart, not just numbers */
      var temps = list.map(function (k) { return h.temperature_2m[k]; });
      var lo = Math.min.apply(null, temps), hi = Math.max.apply(null, temps);
      var span = (hi - lo) || 1;

      var rows = list.map(function (k) {
        var tk = new Date(h.time[k]);
        var ik = WP.wmo(h.weather_code[k], h.is_day && h.is_day[k] === 0);
        var pop = h.precipitation_probability ? Math.round(h.precipitation_probability[k]) : 0;
        var w = 12 + ((h.temperature_2m[k] - lo) / span) * 78;
        return '<button class="hrow tappable' + (k === i ? " sel" : "") + '"'
          + ' aria-current="' + (k === i ? "true" : "false") + '"'
          + ' aria-label="' + esc(fmt.hourLabel(tk) + ", " + ik.text + ", "
              + fmt.deg(h.temperature_2m[k]) + ", " + pop + "% chance of rain") + '"'
          + ' data-ns="hourly" data-act="pick" data-arg="' + k + '">'
          + '<span class="hrow-t">' + esc(fmt.hourLabel(tk)) + "</span>"
          + '<span class="hrow-i" aria-hidden="true">' + WP.wxIcon(h.weather_code[k], h.is_day && h.is_day[k] === 0) + "</span>"
          + '<span class="hrow-bar" aria-hidden="true"><span style="width:'
          + w.toFixed(1) + '%"></span></span>'
          + '<span class="hrow-d">' + fmt.deg(h.temperature_2m[k]) + "</span>"
          + '<span class="hrow-p' + (pop >= 30 ? " wet" : "") + '">' + pop + "%</span>"
          + "</button>";
      }).join("");

      /* Scroll-preserving: tapping a row in the list must not throw the list back to the
         top, which is the whole reason picking an hour does not re-scroll. */
      /* "Next 24 hours", not "Next 24 hours — tap to inspect". Every other small-caps
         heading in the app names its section; this one was the only one carrying an
         instruction, which made it read as a different KIND of thing at a glance and put
         a sentence into a row of labels. The rows are buttons with a pressed state and a
         selected row already highlighted — the affordance is the control, not a caption. */
      WP.repaint(body, readout
        + this.chart(h, list, i)
        + section("Next 24 hours",
        '<div class="hrows">' + rows + "</div>"));

      /* Opening on hour 21 of 24 used to highlight a row 21 rows below the fold. Put the
         selected row on screen. Measured with rects rather than offsetTop because the
         scroller (.panel-body) is not the offset parent — the .panel is.

         The factor works the opposite way round to how it reads: scrollTop += delta -
         clientHeight * f, so a LARGER f scrolls less and keeps more of what is above.

         It was 0.42 while the readout block was ~45vh of a ~79vh scrollport — at that size
         no scroll position that also showed row 21 of 24 could include the headline, so the
         factor only decided how much of it was lost. The row hero and the three-across
         grids took that block down to ~26vh, and 0.42 then landed the first few hours a few
         vh down the page, slicing the hero glyph in half at the top of a freshly opened
         panel — content cut off mid-glyph reads as broken, not as scrolled. At 0.5 the
         selected row sits mid-scrollport, which for hour 0-2 computes to a negative offset,
         clamps to zero, and leaves the panel opening at its top. A late hour is unchanged:
         the body is pinned at maximum scroll either way. */
      if (scrollToSel) {
        var sel = WP.qs(".hrow.sel", body);
        if (sel) {
          var delta = sel.getBoundingClientRect().top - body.getBoundingClientRect().top;
          body.scrollTop = Math.max(0, body.scrollTop + delta - body.clientHeight * 0.5);
        }
      }
    }
  };

  WP.register(hourly);
})();
