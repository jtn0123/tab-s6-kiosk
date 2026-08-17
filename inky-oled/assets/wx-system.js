/* Wall panel dashboard — DEVICE.

   Real values through the Android JS bridge. MainActivity exposes one deviceInfo() call
   returning a JSON snapshot; doing it in a single call keeps the JS/Java hop off the
   render path.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it). The plugin
   contract is unchanged and is documented in wx-ui.js.
*/

(function () {
  "use strict";

  var $ = WP.$, esc = WP.esc, fmt = WP.fmt, S = WP.settings;
  var ui = WP.ui;
  var statGrid = ui.statGrid, section = ui.section, hero = ui.hero, bar = ui.bar;

  var system = {
    name: "system",
    info: null,
    lastPoll: 0,
    shownBig: null,
    shownSub: null,

    /* Two cadences. The panel is a live readout and wants 5 s; the home tile carries a
       battery percentage, free storage, uptime rounded to the largest unit, and a network
       type — none of which is meaningfully wrong at 60 s, and three of which move slower
       than that.

       The old single 5 s cadence crossed the JS/Java boundary ~17,300 times a day and
       re-rendered the tile every time, whether the panel was open or not and whether
       anything had changed or not. Nothing on the wall was better for it: with the panel
       closed the tile changed maybe 300 times in that day.

       The timer itself still fires at 5 s so that opening the panel gets a fresh reading
       within one tick rather than up to a minute later — what backs off is the JNI call and
       the render, not the callback. */
    POLL_OPEN_MS: 5000,
    POLL_IDLE_MS: 60000,

    init: function () {
      this.refresh();
      setInterval(this.tick.bind(this), this.POLL_OPEN_MS);
    },

    tick: function () {
      var due = WP.panels.isOpen("system") ? this.POLL_OPEN_MS : this.POLL_IDLE_MS;
      /* 100 ms of tolerance: setInterval jitter must not push a poll a whole period late. */
      if (Date.now() - this.lastPoll < due - 100) return;
      this.refresh();
    },

    refresh: function () {
      this.lastPoll = Date.now();
      this.info = WP.bridge.json("deviceInfo");
      this.render();
      this.paintPanel();
    },

    render: function () {
      var big = $("sys-big"), sub = $("sys-sub");
      if (!big) return;
      var i = this.info;
      if (!i) {
        this.put(big, sub, "n/a", WP.bridge.present() ? "sensor error" : "no device link");
        return;
      }
      /* "↯" (U+21AF), not "⚡" (U+26A1): the latter is an emoji-presentation codepoint and
         Android drew it as a colour sprite in an otherwise monochrome tile row. */
      this.put(big, sub,
        (i.battery && i.battery.level != null ? i.battery.level : "--") + "%"
          + (i.battery && i.battery.charging ? " ↯" : ""),
        /* The tile is a third of the panel wide — short units only, or it ellipsises. */
        [
          fmt.bytes(i.storage && i.storage.free),
          fmt.durationShort(i.uptimeMs || 0) + " up",
          (i.network && i.network.type) || "offline"
        ].join(" · "));
    },

    /* Dirty-checked tile write. A poll that finds nothing changed — which is most of them,
       since the tile's coarsest field is a whole percent — should cost no DOM writes at all. */
    put: function (big, sub, bigText, subText) {
      if (bigText !== this.shownBig) { this.shownBig = bigText; big.textContent = bigText; }
      if (subText !== this.shownSub) { this.shownSub = subText; sub.textContent = subText; }
    },

    onOpen: function (panel) {
      this.panel = panel;
      /* The tile may be up to POLL_IDLE_MS stale when the panel is opened, and the panel is
         the detailed view of exactly that data — so take a reading now rather than showing a
         minute-old battery voltage until the next tick. */
      this.refresh();
    },
    onClose: function () { this.panel = null; },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("system");
      /* refreshes every 5 s — skip while a finger is down, keep the scroll position */
      if (!panel || !WP.panels.isOpen("system") || WP.touching()) return;
      var body = WP.qs("[data-body]", panel);
      var i = this.info;

      if (!i) {
        WP.qs("[data-sub]", panel).textContent = "device sensors unavailable";
        body.innerHTML = '<div class="muted">This panel reads the tablet’s own battery, '
          + "storage and network, and that link is not available right now. Everything else "
          + "on the dashboard still works. Reinstalling the app restores it.</div>";
        return;
      }

      WP.qs("[data-sub]", panel).textContent =
        (i.device && i.device.model ? i.device.model : "device")
        + " · Android " + (i.device ? i.device.android : "?");

      var b = i.battery || {}, st = i.storage || {}, mem = i.memory || {}, net = i.network || {};
      var stUsed = (st.total && st.free != null) ? st.total - st.free : 0;
      var stPct = st.total ? (stUsed / st.total) * 100 : 0;
      var memUsed = (mem.total && mem.free != null) ? mem.total - mem.free : 0;
      var memPct = mem.total ? (memUsed / mem.total) * 100 : 0;

      WP.repaint(body,
        /* monochrome hero: charging bolt, or the battery outline that the fill bar
           immediately below fills in. Both are text-presentation glyphs. */
        hero(b.charging ? "↯" : "▭",
             (b.level != null ? b.level : "--") + "%",
             esc(b.status || "") + (b.plugged ? " · " + esc(b.plugged) : ""))
        + bar(b.level || 0, b.charging ? "accent" : (b.level < 20 ? "danger" : ""), "battery")

        + section("Battery", statGrid([
            ["Level", (b.level != null ? b.level : "--") + "%"],
            ["Charging", b.charging ? "Yes" : "No"],
            ["Status", esc(b.status || "--")],
            ["Plugged", esc(b.plugged || "not plugged")],
            ["Temperature", b.tempC != null
              ? (S.isMetric() ? (Math.round(b.tempC * 10) / 10) + " °C"
                              : (Math.round((b.tempC * 9 / 5 + 32) * 10) / 10) + " °F") : "--"],
            ["Voltage", b.voltageMv != null ? (b.voltageMv / 1000).toFixed(3) + " V" : "--"],
            ["Health", esc(b.health || "--")],
            ["Technology", esc(b.technology || "--")]
          ], 3))

        + section("Storage", bar(stPct, "", "storage used") + statGrid([
            ["Free", fmt.bytes(st.free)],
            ["Used", fmt.bytes(stUsed)],
            ["Total", fmt.bytes(st.total)],
            ["Used %", stPct.toFixed(1) + "%"]
          ], 3))

        + section("Memory", bar(memPct, "", "memory used") + statGrid([
            ["Free", fmt.bytes(mem.free)],
            ["Total", fmt.bytes(mem.total)],
            ["Low memory", mem.low ? "Yes" : "No"],
            ["Used %", memPct.toFixed(1) + "%"]
          ], 3))

        + section("Network", statGrid([
            ["Transport", esc(net.type || "none")],
            ["Internet", net.validated ? "Working" : "No connection"],
            ["Metered", net.metered ? "Yes" : "No"],
            ["Interface", esc(net.iface || "--")],
            ["Down", net.downKbps ? Math.round(net.downKbps / 1000) + " Mbps" : "--"],
            ["Up", net.upKbps ? Math.round(net.upKbps / 1000) + " Mbps" : "--"]
          ], 3))

        + section("Uptime & device", statGrid([
            ["Uptime", esc(fmt.duration(i.uptimeMs || 0))],
            ["Awake", esc(fmt.duration(i.awakeMs || 0))],
            ["Model", esc((i.device || {}).model || "--")],
            ["Manufacturer", esc((i.device || {}).manufacturer || "--")],
            ["Android", esc((i.device || {}).android || "--") + " (API "
              + esc((i.device || {}).sdk || "?") + ")"],
            ["Screen", esc((i.device || {}).screen || "--")],
            ["Density", esc(String((i.device || {}).density || "--")) + " dpi"],
            ["Brightness", i.brightness != null ? Math.round(i.brightness / 255 * 100) + "%" : "--"]
          ], 3)));
    }
  };

  WP.register(system);
})();
