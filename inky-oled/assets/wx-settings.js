/* Wall panel dashboard — SETTINGS.

   Real, persisted, applied immediately. One idiom per concept: a segmented control only
   for a genuine either/or between two named values, a switch row for everything that is
   merely on or off.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it). The plugin
   contract is unchanged and is documented in wx-ui.js.
*/

(function () {
  "use strict";

  var C = WP.C;
  var $ = WP.$, esc = WP.esc, S = WP.settings;
  var ui = WP.ui;
  var section = ui.section, btn = ui.btn, segmented = ui.segmented,
      switchRow = ui.switchRow;

  var settingsPlugin = {
    name: "settings",
    resetArmed: false,
    resetTimer: null,

    init: function () {
      var self = this;
      this.renderCard();
      S.onChange(function () { self.renderCard(); self.paintPanel(); });

      WP.onAction("settings", function (act, arg) {
        /* Any other setting touched means the user is not resetting — disarm. */
        if (act !== "reset" && self.resetArmed) self.disarmReset();

        switch (act) {
          /* Two shapes of control, and which one a setting gets is decided by the setting,
             not by the screen it happens to sit on (D1):
               units / hours  a genuine either/or between two NAMED values -> segmented,
                              and the action carries which value was chosen;
               secs / burn / widget  simply on or off -> a switch row, and the action is a
                              toggle. Passing an explicit "1"/"0" here would mean the row
                              and the stored value could disagree if a repaint were missed. */
          case "units":  S.set("units", arg); break;
          case "hours":  S.set("clockHours", parseInt(arg, 10)); break;
          case "secs":   S.set("seconds", !S.get("seconds")); break;
          case "burn":   S.set("burnIn", !S.get("burnIn")); break;
          case "sky":    S.set("sky", !S.get("sky")); break;
          case "widget": S.setShow(arg, !S.get("show")[arg]); break;
          /* Two-step. This panel is mounted on a wall where anyone walking past can reach
             it, and one tap on a red button used to wipe every preference with no warning
             and no undo. The armed state expires on its own after 5 s. */
          case "reset":
            if (self.resetArmed) {
              self.disarmReset();
              S.reset();
              WP.toast("Settings reset to defaults");
            } else {
              self.resetArmed = true;
              clearTimeout(self.resetTimer);
              self.resetTimer = setTimeout(function () {
                self.resetArmed = false;
                self.paintPanel();
              }, 5000);
              WP.toast("Tap again to confirm reset");
            }
            break;
        }
        self.paintPanel();
      });
    },

    disarmReset: function () {
      this.resetArmed = false;
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    },

    renderCard: function () {
      var el = $("set-sub");
      if (!el) return;
      var hidden = WP.WIDGETS.filter(function (w) { return !S.get("show")[w]; }).length;
      el.textContent = (S.isMetric() ? "°C" : "°F") + " · " + S.get("clockHours") + "h"
        + (hidden ? " · " + hidden + " hidden" : "");
    },

    onOpen: function (panel) { this.panel = panel; this.disarmReset(); this.paintPanel(); },
    onClose: function () { this.panel = null; this.disarmReset(); },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("settings");
      if (!panel || !WP.panels.isOpen("settings")) return;
      var body = WP.qs("[data-body]", panel);
      /* D4 — this line used to read "saved to localStorage — survives a force-stop", which
         is a commit message, not something to tell somebody adjusting a thermostat panel. */
      WP.qs("[data-sub]", panel).textContent = "Changes are kept after a restart";

      var show = S.get("show");
      var rows = WP.WIDGETS.map(function (w) {
        return switchRow("settings", "widget", WP.WIDGET_LABELS[w], !!show[w], w);
      }).join("");

      var b = C.burnInProtection || {};

      WP.repaint(body,
        /* Segmented for the two settings that are a choice between named values... */
        section("Units", segmented("settings", "units",
            [["fahrenheit", "°F  mph  inHg"], ["celsius", "°C  km/h  hPa"]],
            S.get("units"), "Units"))

        /* ...and a switch for everything that is merely on or off, including the one that
           used to sit here as "Hide seconds | Show seconds" — a pair of buttons for a
           boolean, two rows above a column of switches for the same thing (D1). */
        + section("Clock", segmented("settings", "hours",
            [[12, "12-hour"], [24, "24-hour"]], S.get("clockHours"), "Clock format")
          + '<div class="srows">'
          + switchRow("settings", "secs", "Show seconds", !!S.get("seconds"))
          + "</div>")

        /* D5 — one line, not five. The five-line version explained AMOLED ghosting, the
           nudge distance, the interval, the finger rule and the 90 s idle unwind, on a
           settings screen. All of it is still in INTERACTIVE.md, where somebody who wants
           it will look. */
        + section("Display", '<div class="srows">'
          + switchRow("settings", "sky", "Weather in the background", S.get("sky") !== false, null,
              "Stars, rain, snow and clouds drawn behind the dashboard, matching outside.")
          + switchRow("settings", "burn", "Drift the layout", !!S.get("burnIn"), null,
              "Nudges everything a few pixels every "
              + Math.round((b.intervalSeconds || 120) / 60) + " minutes so nothing burns in.")
          + "</div>")

        /* WP.repaint, not body.innerHTML: replacing the content outright drops the scroll
           offset, so toggling "Daily forecast" jumped the panel back to UNITS and the next
           tap landed on a control the user was not aiming at. Same reason the sensors and
           device panels use it. */
        + section("Widgets", '<div class="srows">' + rows + "</div>")

        + section("Maintenance",
            '<div class="btn-row">'
            + btn("reset", this.resetArmed ? "Tap again to confirm" : "Reset to defaults",
                  "danger", null, "settings")
            + "</div>"
            + (this.resetArmed
                ? '<div class="muted">This clears units, clock format, burn-in and which '
                  + "widgets are shown. Tap anything else to cancel.</div>"
                : ""))

        /* Two sentences about what this dashboard is currently connected to, which is the
           only thing an About section on a wall panel can usefully say.
           "screen 711 × 1138" is gone: it was the CSS-pixel viewport, so it was a rendering
           detail rather than a fact about the room, AND it was not the screen — the panel
           is 1600 × 2560. A number that is jargon and also wrong is the easiest kind to
           delete. */
        + section("About", '<div class="muted">Home readings are '
            + (WP.registry.sensors.mode === "demo" ? "simulated" : "live from Home Assistant")
            + ". This tablet's own battery and storage are "
            + (WP.bridge.present() ? "being read" : "not readable right now")
            + ".</div>"));
    }
  };

  WP.register(settingsPlugin);
})();
