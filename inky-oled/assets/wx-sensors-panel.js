/* Wall panel dashboard — HOME ASSISTANT DETAIL PANEL.

   The full-screen panel for the sensors widget: the entity picker, the reading hero,
   the two-hour trace and the per-entity stats. Split from wx-sensors.js purely for the
   500-line file budget — it attaches paintPanel onto the widget wx-sensors.js registered
   (this file loads after it), and everything renders through the same WP.ui builders.

   One file, one job (assets/ cannot hold subdirectories — aapt2 on Windows writes the
   separator as a backslash and file:///android_asset/ cannot resolve it).
*/

(function () {
  "use strict";

  var esc = WP.esc, fmt = WP.fmt, S = WP.settings;
  var ui = WP.ui;
  var statGrid = ui.statGrid, section = ui.section, hero = ui.hero, btn = ui.btn,
      bar = ui.bar, switchRow = ui.switchRow;

  var sensors = WP.registry.sensors;

  /* ---------------- the y-domain floor ----------------
     THE defect this panel had: the trace autoscaled to whatever it happened to contain, so
     a living room that drifted from 74.5 °F to 75.5 °F over two hours was drawn as a range
     of mountains filling a ~500 px plot. The stats underneath said 74.5 / 75.5 and nobody
     reads stats to correct a picture. From 3 m that screen shouted "something is happening
     in your house" every single day, for ever, about one degree — and it is the only screen
     that reports on the reader's own home, so it is the one that has to be trustworthy.

     The fix is the same one every real thermostat app uses: a MINIMUM SPAN per unit, below
     which the line simply goes flat because nothing happened. The numbers are the smallest
     change of each quantity a person would actually notice in a room:

       °F    4 degrees      you feel a 4 °F change; you do not feel 1
       °C    2 degrees      the same interval in the other scale
       %     10 points      relative humidity, battery, anything on a 0-100 scale
       ppm   200            CO2: 600 vs 800 is a real difference, 610 vs 620 is drift
       W     50             a light bulb

     Unknown units fall back to a tenth of the reading's own magnitude, which is scale-free
     and always beats "the range of the last two hours". */
  var MIN_SPAN = { "°F": 4, "°C": 2, "%": 10, ppm: 200, ppb: 200, W: 50, kW: 0.5, V: 1 };

  function domain(vals, unit) {
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var mid = (lo + hi) / 2;
    var floor = MIN_SPAN[unit];
    if (floor == null) floor = Math.max(Math.abs(mid) * 0.1, 1e-6);
    if (hi - lo >= floor) {
      /* a real swing: keep it, with a little headroom so the peak is not on the frame */
      var pad = (hi - lo) * 0.12;
      return { min: lo - pad, max: hi + pad, flat: false };
    }
    return { min: mid - floor / 2, max: mid + floor / 2, flat: true };
  }

  /* The trace with its own axis. There was none: no y-scale, no x-scale, nothing on the
     screen to say what the line's height meant, which is what let the shape lie unopposed.
     The labels are HTML over the SVG rather than SVG <text>, for the reason the hourly
     chart gives: a size inside a scaling viewBox is a size authored outside the ramp. */
  function plot(svg, dom, unit, dp, binary) {
    function edge(v) {
      return binary ? (v > 0.5 ? "On" : "Off") : Number(v).toFixed(dp || 0) + " " + unit;
    }
    return '<div class="plot">' + svg
      + '<span class="plot-hi">' + esc(edge(dom.max)) + "</span>"
      + '<span class="plot-lo">' + esc(edge(dom.min)) + "</span>"
      + '<div class="plot-x"><span>2h ago</span><span>now</span></div></div>';
  }

  sensors.paintPanel = function () {
      var panel = this.panel || WP.panels.el("sensors");
      if (!panel || !WP.panels.isOpen("sensors") || WP.touching()) return;
      var body = WP.qs("[data-body]", panel);
      var e = this.find(this.sel) || this.ents[0];
      if (!e) { body.innerHTML = '<div class="muted">No entities.</div>'; return; }

      WP.qs("[data-sub]", panel).textContent = this.panelSub(e);

      /* cols3: nine entities on a wrapping row broke 4 + 4 + 1, leaving one chip alone
         under a row of four. Three rows of three. */
      var chips = '<div class="chip-row cols3" role="radiogroup" aria-label="Reading">'
        + this.ents.map(function (x) {
          var on = x.id === e.id;
          return '<button class="chip tappable' + (on ? " on" : "") + '"'
            + ' role="radio" aria-checked="' + (on ? "true" : "false") + '"'
            + ' data-ns="sensors" data-act="pick" data-arg="' + esc(x.id) + '">'
            + '<span aria-hidden="true">' + sensors.glyph(x) + "</span> "
            + esc(x.label) + "</button>";
        }).join("") + "</div>";
      /* scroll position is preserved: this panel repaints on every tick as values move */

      var vals = e.hist.map(function (p) { return sensors.out(e, p.v); });
      var unit = sensors.outUnit(e);
      var nums = vals.filter(function (v) { return typeof v === "number"; });
      var min = nums.length ? Math.min.apply(null, nums) : null;
      var max = nums.length ? Math.max.apply(null, nums) : null;
      var avg = nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : null;
      var r = function (v) { return v == null ? "--" : Number(v).toFixed(e.dp || 0); };

      /* on/off entities get a fixed 0..1 domain (with headroom) so the trace reads as a
         square wave, and duty-cycle stats instead of a meaningless min/max/mean */
      var binary = (e.kind === "toggle" || e.kind === "binary");
      var dom = binary ? { min: -0.15, max: 1.15, flat: false }
                       : domain(nums.length ? nums : [0], unit);
      var spark = { w: 300, h: 70, min: dom.min, max: dom.max };
      var duty = binary ? this.duty(e.hist) : null;
      var changed = binary ? this.lastChange(e.hist) : null;

      var control = "";
      if (e.kind === "toggle") {
        control = '<div class="btn-row">'
          + btn("toggle", e.on ? "Turn off" : "Turn on", e.on ? "danger" : "primary", e.id, "sensors")
          + "</div>";
      }

      /* The warm-bordered block is an ALERT, and only an alert: this feed is real and it
         has stopped answering. It used to carry a permanent demo notice as well, which
         both trained the eye to ignore the colour and argued with the subtitle (see
         panelSub). In demo mode there is now nothing here. */
      var note = "";
      if (e.err) {
        note = '<div class="demo-note">' + esc(this.entityNote(e))
          + (e.okAt ? ". It last answered " + esc(fmt.ago(e.okAt)) : "") + ".</div>";
      }

      var freshAt = e.hist.length ? e.hist[e.hist.length - 1].t : 0;

      WP.repaint(body, chips + note
        /* The line under the number used to be "Living room · sensor.living_room_temperature"
           — the entity id, printed on a wall, and printed a second time in an ENTITY grid
           below it where `overflow-wrap: anywhere` snapped it mid-word as
           "sensor.living_room_te / mperature". An id is how the app finds the reading, not
           anything the reader can use. It says how fresh the number is instead. */
        + hero(this.glyph(e),
               esc(this.display(e)) + ' <span class="dim">' + esc(unit) + "</span>",
               esc(e.label) + (freshAt ? " · updated " + esc(fmt.ago(freshAt)) : ""),
               this.isOffish(e) ? "dim" : "")
        + control
        /* "Samples 241" went with the ENTITY grid: it is the length of an internal array,
           and it moves when the poll interval is reconfigured without anything in the room
           having changed. Min / max / mean is the whole of what two hours of a number has
           to say. */
        + section("Last 2 hours", plot(WP.sparkline(vals, spark), dom, unit, e.dp, binary)
            + (binary
                ? statGrid([["State now", esc(this.display(e))],
                    ["On", duty == null ? "--" : Math.round(duty * 100) + "% of window"],
                    ["Off", duty == null ? "--" : Math.round((1 - duty) * 100) + "% of window"],
                    ["Last change", changed ? esc(fmt.ago(changed)) : "over 2 h ago"]])
                : statGrid([["Lowest", r(min) + " " + esc(unit)],
                    ["Highest", r(max) + " " + esc(unit)],
                    ["Average", r(avg) + " " + esc(unit)]], 3))));
    }
})();
