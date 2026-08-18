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
      var spark = binary ? { w: 300, h: 70, min: -0.15, max: 1.15 } : { w: 300, h: 70 };
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
        + section("Last 2 hours", WP.sparkline(vals, spark)
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
