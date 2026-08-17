/* Wall panel dashboard — CLOCK.

   The wall clock on the home card, and a detail panel with the calendar arithmetic
   and nine world clocks — all computed with Intl, no network and no key.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it). The plugin
   contract is unchanged and is documented in wx-ui.js.
*/

(function () {
  "use strict";

  var $ = WP.$, esc = WP.esc, fmt = WP.fmt, S = WP.settings;
  var ui = WP.ui;
  var statGrid = ui.statGrid, section = ui.section;

  var clock = {
    name: "clock",
    panelTimer: null,

    /* Last value written to each of the four nodes. The tick has to run at 1 Hz — the
       seconds field is optional but real — while the minute changes 1/60 as often and the
       date once a day. Writing all four every second meant 86,400 toLocaleDateString() calls
       and 345,600 textContent assignments a day to produce ~1,500 actual changes; every one
       of those assignments is a layout invalidation on the busiest element on the wall.
       Cache what was written and skip the writes that would change nothing. The dirty check
       is on the RENDERED STRING, not on the clock, so a 12/24h flip or a seconds toggle
       still lands on the very next tick (S.onChange calls straight into here). */
    shown: { time: null, ampm: null, secs: null, date: null },

    init: function () {
      this.tick();
      setInterval(this.tick.bind(this), 1000);
      S.onChange(this.tick.bind(this));   // 12/24h and seconds apply immediately
    },

    /* Write only if the text actually differs. */
    put: function (id, key, value) {
      if (this.shown[key] === value) return false;
      this.shown[key] = value;
      var el = $(id);
      if (el) el.textContent = value;
      return true;
    },

    tick: function () {
      var now = new Date();
      var h = now.getHours(), m = now.getMinutes(), ampm = "";
      if (S.get("clockHours") === 12) {
        ampm = h >= 12 ? "PM" : "AM";
        h = h % 12; if (h === 0) h = 12;
      } else {
        h = WP.pad2(h);
      }
      this.put("time", "time", h + ":" + WP.pad2(m));
      this.put("ampm", "ampm", ampm);
      this.put("secs", "secs", S.get("seconds") ? ":" + WP.pad2(now.getSeconds()) : "");

      /* toLocaleDateString is the expensive one (it builds an Intl formatter), so it is
         guarded by the calendar day rather than by comparing its own output — that would
         mean calling it to find out whether it was worth calling. */
      var day = now.getFullYear() + "-" + now.getMonth() + "-" + now.getDate();
      if (day !== this.shownDay) {
        this.shownDay = day;
        this.put("date", "date", now.toLocaleDateString(undefined, {
          weekday: "long", month: "long", day: "numeric"
        }));
      }
    },

    /* Detail: seconds, full date, timezone, and world clocks computed with Intl —
       real data, no network, no key. */
    onOpen: function (panel) {
      var self = this;
      var body = WP.qs("[data-body]", panel);
      var tz = "";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { tz = ""; }
      /* IANA zone ids are written with underscores. That is a machine detail, and this is a
         subtitle on a wall — "America/Los Angeles" says the same thing to a person. */
      var tzText = tz ? tz.replace(/_/g, " ") : "";
      WP.qs("[data-sub]", panel).textContent = tzText || "local time";

      var zones = [
        ["Los Angeles", "America/Los_Angeles"],
        ["Denver", "America/Denver"],
        ["Chicago", "America/Chicago"],
        ["New York", "America/New_York"],
        ["UTC", "UTC"],
        ["London", "Europe/London"],
        ["Berlin", "Europe/Berlin"],
        ["Tokyo", "Asia/Tokyo"],
        ["Sydney", "Australia/Sydney"]
      ];

      /* Two cadences, not one.

         This whole body used to be rebuilt once a second: nine world clocks, each costing
         two freshly-constructed Intl.DateTimeFormat objects, plus a full innerHTML swap of
         the panel — 18 formatter constructions per second for a row of numbers that shows
         minutes and therefore changes once a minute.

         Only two things on this panel genuinely move every second: the big readout (it shows
         seconds) and the epoch counter. Those two get their own nodes and a textContent
         write; everything else is rebuilt when the minute rolls over, or when a setting that
         affects it changes. Same pixels, 1/60th of the work — and as a side effect the panel
         stops replacing its own DOM under a reader's finger 59 times a minute. */
      function liveKey() {
        var n = new Date();
        return n.getFullYear() + "-" + n.getMonth() + "-" + n.getDate()
          + " " + n.getHours() + ":" + n.getMinutes() + " " + S.get("clockHours");
      }

      function tickLight() {
        var now = new Date();
        if (liveKey() !== self.panelKey) { render(); return; }
        var big = $("clk-big");
        if (!big) { render(); return; }          // panel was rebuilt from under us
        big.textContent = fmt.clock(now, true);
        var ep = $("clk-epoch");
        if (ep) ep.textContent = String(Math.floor(now.getTime() / 1000));
      }

      function render() {
        var now = new Date();
        self.panelKey = liveKey();
        var offMin = -now.getTimezoneOffset();
        var offTxt = (offMin >= 0 ? "+" : "-") + WP.pad2(Math.abs(offMin) / 60)
          + ":" + WP.pad2(Math.abs(offMin) % 60);

        /* day-of-year / ISO week are cheap extras that make the panel worth opening.
           Both are DST-sensitive calendar arithmetic (see fmt.dayOfYear for the bug that
           taught us so), so they live in fmt with the rest of the formatters. */
        var doy = fmt.dayOfYear(now);
        var isoWeek = fmt.isoWeek(now);

        /* Scroll-preserving: this rebuilds once a second, so a plain innerHTML swap would
           make the panel impossible to scroll at all. */
        WP.repaint(body,
          '<div class="big-readout"><div class="big-time" id="clk-big">'
          + esc(fmt.clock(now, true)) + "</div>"
          + '<div class="big-sub">' + esc(now.toLocaleDateString(undefined, {
              weekday: "long", year: "numeric", month: "long", day: "numeric" })) + "</div></div>"
          + section("This device", statGrid([
              ["Time zone", esc(tzText || "unknown")],
              ["UTC offset", "UTC" + offTxt],
              ["Day of year", String(doy)],
              ["ISO week", String(isoWeek)],
              ["Unix time", '<span id="clk-epoch">' + Math.floor(now.getTime() / 1000) + "</span>"],
              ["Format", S.get("clockHours") === 24 ? "24-hour" : "12-hour"]
            ]))
          + section("World clocks", '<div class="wc-grid">' + zones.map(function (z) {
              var s = "--:--", day = "";
              try {
                s = new Intl.DateTimeFormat(undefined, {
                  timeZone: z[1], hour: "numeric", minute: "2-digit",
                  hour12: S.get("clockHours") === 12
                }).format(now);
                day = new Intl.DateTimeFormat(undefined, {
                  timeZone: z[1], weekday: "short" }).format(now);
              } catch (e) { /* zone unsupported on this ICU build */ }
              return '<div class="wc"><div class="wc-city">' + esc(z[0]) + "</div>"
                + '<div class="wc-time">' + esc(s) + "</div>"
                + '<div class="wc-day">' + esc(day) + "</div></div>";
            }).join("") + "</div>"));
      }

      render();
      this.panelTimer = setInterval(tickLight, 1000);
      /* No S.onChange registration here: onOpen runs every time the panel is opened, and a
         listener added per open is a listener that is never removed. It is not needed either
         — liveKey() carries clockHours, so a 12/24h flip forces a full rebuild on the very
         next tick, which is the same latency the old rebuild-everything loop had. */
      WP.onAction("clock", function () { /* no in-panel actions */ });
    },

    onClose: function () {
      clearInterval(this.panelTimer);
      this.panelTimer = null;
      this.panelKey = null;
    }
  };

  WP.register(clock);
})();
