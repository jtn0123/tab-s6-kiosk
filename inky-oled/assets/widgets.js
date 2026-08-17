/* Wall panel dashboard — WIDGETS.

   Each widget is a self-contained plugin object registered with WP.register():

     name      matches the card's data-widget / data-open and the panel's data-panel
     init()    called once at boot; owns its own refresh cadence
     onOpen()  fills its full-screen detail panel (panel element, optional argument)
     onClose() tears down anything the panel started (per-second tickers, mostly)

   Nothing here touches another widget's DOM. The only cross-widget wiring is the weather
   fetch: one request feeds the "now", "hourly" and "daily" cards, so those three subscribe
   to it instead of each hitting Open-Meteo separately. */

(function () {
  "use strict";

  var C = WP.C;
  var $ = WP.$, esc = WP.esc, fmt = WP.fmt, S = WP.settings;

  /* ---------------- shared panel building blocks ---------------- */

  /* A responsive grid of labelled values — the backbone of most detail panels.
     items: [label, valueHTML, extraText?] */
  function statGrid(items) {
    return '<div class="stat-grid">' + items.map(function (it) {
      return '<div class="stat">'
        + '<div class="stat-k">' + esc(it[0]) + "</div>"
        + '<div class="stat-v">' + it[1] + "</div>"
        + (it[2] ? '<div class="stat-x">' + esc(it[2]) + "</div>" : "")
        + "</div>";
    }).join("") + "</div>";
  }

  function section(title, inner) {
    return '<section class="psec"><h2 class="psec-t">' + esc(title) + "</h2>" + inner + "</section>";
  }

  /* Horizontal fill bar with a percentage. Used for storage, memory and battery. */
  function bar(pct, tone) {
    var p = Math.max(0, Math.min(100, pct || 0));
    return '<div class="bar"><div class="bar-fill ' + (tone || "")
      + '" style="width:' + p.toFixed(1) + '%"></div></div>';
  }

  function btn(act, label, cls, arg, ns) {
    return '<button class="btn tappable ' + (cls || "") + '" data-act="' + act + '"'
      + (arg != null ? ' data-arg="' + esc(arg) + '"' : "")
      + (ns ? ' data-ns="' + ns + '"' : "")
      + ">" + label + "</button>";
  }

  /* Segmented two-or-more-way choice, used throughout Settings. */
  function segmented(ns, act, options, current) {
    return '<div class="seg">' + options.map(function (o) {
      return '<button class="seg-b tappable' + (String(o[0]) === String(current) ? " on" : "")
        + '" data-ns="' + ns + '" data-act="' + act + '" data-arg="' + esc(o[0]) + '">'
        + esc(o[1]) + "</button>";
    }).join("") + "</div>";
  }

  /* =========================================================================
     1. CLOCK — real device time
     ========================================================================= */
  var clock = {
    name: "clock",
    panelTimer: null,

    init: function () {
      this.tick();
      setInterval(this.tick.bind(this), 1000);
      S.onChange(this.tick.bind(this));   // 12/24h and seconds apply immediately
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
      $("time").textContent = h + ":" + WP.pad2(m);
      $("ampm").textContent = ampm;
      $("secs").textContent = S.get("seconds") ? ":" + WP.pad2(now.getSeconds()) : "";
      $("date").textContent = now.toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric"
      });
    },

    /* Detail: seconds, full date, timezone, and world clocks computed with Intl —
       real data, no network, no key. */
    onOpen: function (panel) {
      var self = this;
      var body = WP.qs("[data-body]", panel);
      var tz = "";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { tz = ""; }
      WP.qs("[data-sub]", panel).textContent = tz || "local time";

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

      function render() {
        var now = new Date();
        var offMin = -now.getTimezoneOffset();
        var offTxt = (offMin >= 0 ? "+" : "-") + WP.pad2(Math.abs(offMin) / 60)
          + ":" + WP.pad2(Math.abs(offMin) % 60);

        /* day-of-year / ISO week are cheap extras that make the panel worth opening.
           DOY compares midnight-to-midnight and rounds: measuring from "now" to Jan 0
           spans the spring-forward hour, so the difference was 228 d 23 h and floored to
           228 on day 229 — wrong every day between DST start and DST end. */
        var soy = new Date(now.getFullYear(), 0, 1);
        var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var doy = Math.round((today0 - soy) / 86400000) + 1;
        var t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
        var week1 = new Date(t.getFullYear(), 0, 4);
        var isoWeek = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);

        /* Scroll-preserving: this rebuilds once a second, so a plain innerHTML swap would
           make the panel impossible to scroll at all. */
        WP.repaint(body,
          '<div class="big-readout"><div class="big-time">' + esc(fmt.clock(now, true)) + "</div>"
          + '<div class="big-sub">' + esc(now.toLocaleDateString(undefined, {
              weekday: "long", year: "numeric", month: "long", day: "numeric" })) + "</div></div>"
          + section("This device", statGrid([
              ["Time zone", esc(tz || "unknown")],
              ["UTC offset", "UTC" + offTxt],
              ["Day of year", String(doy)],
              ["ISO week", String(isoWeek)],
              ["Epoch (s)", String(Math.floor(now.getTime() / 1000))],
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
      this.panelTimer = setInterval(render, 1000);
      WP.onAction("clock", function () { /* no in-panel actions */ });
      void self;
    },

    onClose: function () { clearInterval(this.panelTimer); this.panelTimer = null; }
  };

  /* =========================================================================
     2. STOPWATCH / TIMER — real elapsed time
     Timekeeping is done from Date.now() deltas rather than by counting ticks, so it
     stays correct even if the WebView throttles the interval while a panel is closed.
     ========================================================================= */
  var timer = {
    name: "timer",
    mode: "stopwatch",
    sw: { running: false, startedAt: 0, base: 0, laps: [] },
    cd: { running: false, endsAt: 0, remain: 5 * 60000, duration: 5 * 60000 },
    ringing: false,
    finishedAt: 0,
    lastCardPaint: 0,
    lastKey: "",
    audio: null,

    /* How long the alarm overlay may hold the whole screen with nobody in front of it, and
       how long the home tile then remembers that it fired. See fireAlarm / paintCard. */
    ALARM_IDLE_MS: 60000,
    TRACE_MS: 30 * 60000,

    init: function () {
      var self = this;
      setInterval(this.tick.bind(this), 100);

      /* The alarm overlay is not a panel, but it covers the dashboard exactly like one, so
         it registers with the same idle unwind instead of inventing its own timeout. 60s
         rather than the panels' 90s: it is the loudest thing the app can put on screen and
         it hides everything, so it earns less patience. */
      WP.registerIdleLayer({
        name: "alarm",
        ms: this.ALARM_IDLE_MS,
        isOpen: function () { return self.ringing; },
        close: function () { self.stopAlarm(); },
        toast: "Timer finished — dashboard restored"
      });

      /* All in-panel buttons funnel through one handler keyed by data-act. */
      WP.onAction("timer", function (act, arg) {
        var cd = self.cd, sw = self.sw;
        switch (act) {
          case "mode":      self.mode = arg; break;
          case "sw-toggle":
            if (sw.running) { sw.base = self.swElapsed(); sw.running = false; }
            else { sw.startedAt = Date.now(); sw.running = true; }
            break;
          case "sw-lap":
            if (sw.running) { sw.laps.unshift(self.swElapsed()); if (sw.laps.length > 30) sw.laps.pop(); }
            break;
          case "sw-reset":  sw.running = false; sw.base = 0; sw.laps = []; break;
          case "cd-preset": cd.duration = parseInt(arg, 10) * 1000; self.cdReset(); break;
          case "cd-bump":
            var delta = parseInt(arg, 10) * 1000;
            if (cd.running) { cd.endsAt = Math.max(Date.now(), cd.endsAt + delta); }
            else { cd.duration = Math.max(1000, cd.duration + delta); cd.remain = cd.duration; }
            break;
          case "cd-toggle":
            if (cd.running) { cd.remain = Math.max(0, cd.endsAt - Date.now()); cd.running = false; }
            else {
              if (cd.remain <= 0) cd.remain = cd.duration;
              cd.endsAt = Date.now() + cd.remain; cd.running = true;
              self.ringing = false; self.finishedAt = 0;
            }
            break;
          /* order matters: stopAlarm() parks a dismissed countdown at zero, so the reload
             of the full duration has to come after it */
          case "cd-reset":  self.stopAlarm(); self.cdReset(); break;
          /* Dismiss on the full-screen alarm. It used to carry its own click listener,
             which is the one path the pointerup delegation never saw: a short tap worked
             and a 700ms hold — the way anybody presses a button on a wall — did nothing,
             because Chrome swallows the click once it decides the gesture was a long press.
             Routing it through data-act puts it on the same path as every other control. */
          case "alarm-dismiss": self.stopAlarm(); break;
        }
        self.renderPanel();
        self.paintCard();
      });
    },

    swElapsed: function () {
      return this.sw.base + (this.sw.running ? Date.now() - this.sw.startedAt : 0);
    },
    cdRemain: function () {
      return this.cd.running ? Math.max(0, this.cd.endsAt - Date.now()) : this.cd.remain;
    },
    cdReset: function () {
      this.cd.running = false;
      this.cd.remain = this.cd.duration;
      this.ringing = false;
      this.finishedAt = 0;
    },

    /* Milliseconds since a countdown finished, while that is still worth mentioning on the
       home tile — otherwise null. The tile used to read "00:00 / finished" from the moment
       an alarm was dismissed until somebody walked over and pressed Reset inside the panel
       (it survived a full settings reset), so the wall panel's default resting state became
       a stale report about a timer that had ended hours ago. Bounding it is what lets the
       alarm overlay take itself down without the fact that it fired being lost: the tile
       carries a quiet "finished 4m ago" for half an hour, then goes back to "tap to open". */
    trace: function () {
      if (!this.finishedAt) return null;
      var age = Date.now() - this.finishedAt;
      if (age > this.TRACE_MS) { this.finishedAt = 0; return null; }
      return age;
    },

    /* Everything the panel's button row / chip row is drawn from. The 10 Hz fast path only
       rewrites the digits, so any state that changes *outside* a button press (the alarm
       firing, the alarm being dismissed) has to be caught here or the buttons keep their
       old labels — which is how "Pause" ended up starting a countdown. */
    stateKey: function () {
      return [this.mode, this.sw.running ? 1 : 0, this.sw.laps.length,
              this.cd.running ? 1 : 0, this.ringing ? 1 : 0, this.cd.duration].join("|");
    },

    tick: function () {
      /* countdown reaching zero fires the alarm exactly once */
      if (this.cd.running && this.cdRemain() <= 0) {
        this.cd.running = false;
        this.cd.remain = 0;
        this.fireAlarm();
      }
      var open = WP.panels.isOpen("timer");
      var now = Date.now();
      /* 10 Hz while the panel is up (tenths are visible); 1 Hz for the home tile.
         The fast path only rewrites the two nodes that change — rebuilding the panel's
         markup ten times a second would replace buttons out from under a live tap, so a
         full re-render happens only when the control state itself moved (and never with a
         finger down; it will be picked up on the next tick). */
      if (open) {
        if (this.stateKey() !== this.lastKey && !WP.touching()) this.renderPanel();
        else this.tickPanel();
      }
      if (open || now - this.lastCardPaint > 950) { this.lastCardPaint = now; this.paintCard(); }
    },

    paintCard: function () {
      var big = $("tmr-big"), sub = $("tmr-sub");
      if (!big) return;
      /* Priority: anything actually counting beats the memory of something that finished,
         which beats something merely parked. A stopwatch running through an alarm has to
         keep the tile — it is the live number. */
      var trace = this.trace();
      if (this.ringing) {
        big.textContent = "00:00";
        sub.textContent = "TIMER DONE";
      } else if (this.cd.running) {
        big.textContent = fmt.countdown(this.cdRemain());
        sub.textContent = "counting down";
      } else if (this.sw.running) {
        big.textContent = fmt.stopwatch(this.swElapsed(), false);
        sub.textContent = "stopwatch running";
      } else if (trace != null) {
        /* the quiet trace: it fired, here is roughly when, and it expires by itself */
        big.textContent = "00:00";
        sub.textContent = trace < 60000 ? "just finished"
          : "finished " + fmt.durationShort(trace) + " ago";
      } else if (this.cd.remain > 0 && this.cd.remain < this.cd.duration) {
        big.textContent = fmt.countdown(this.cd.remain);
        sub.textContent = "paused";
      } else if (this.swElapsed() > 0) {
        big.textContent = fmt.stopwatch(this.swElapsed(), false);
        sub.textContent = "stopwatch paused";
      } else {
        big.textContent = "00:00";
        sub.textContent = "tap to open";
      }
      big.classList.toggle("alert", this.ringing);
    },

    /* The countdown hitting zero and the alarm being dismissed both change which controls
       are legal, so both repaint the panel and the home tile instead of leaving the last
       button row on screen. */
    fireAlarm: function () {
      this.ringing = true;
      this.finishedAt = Date.now();
      $("alarm-sub").textContent = fmt.countdown(this.cd.duration) + " countdown elapsed";
      $("alarm").classList.add("show");
      /* Start the idle countdown on the overlay itself. Without this the alarm only ever
         came down when a human pressed Dismiss. */
      WP.armIdle();
      this.renderPanel();
      this.paintCard();
      this.beep();
    },
    /* Called by Dismiss, by a tap anywhere on the overlay, by Reset, and by the idle unwind
       — all four want the same thing, so there is one path. */
    stopAlarm: function () {
      if (!this.ringing) return;
      this.ringing = false;
      /* Dismiss must leave the countdown genuinely stopped at zero, not merely quiet:
         anything else lets the next tap on the primary button re-fire the same alarm. */
      this.cd.running = false;
      this.cd.remain = 0;
      $("alarm").classList.remove("show");
      this.renderPanel();
      this.paintCard();
    },

    /* One AudioContext for the life of the page, created the first time an alarm actually
       needs to sound and reused afterwards, instead of a fresh context per alarm.

       Be precise about what this did and did not buy, because the reuse was originally
       written up as a fix for something it does not fix. Every ring still logs 4-5 of
       "AS.AudioService: Uncaught exception" from system_server — measured across three
       consecutive alarms, with the audio session id staying constant, so the context really
       is being reused and the exceptions are not tied to session creation. They come from
       Samsung's AudioServiceDumpProvider dumping AudioService on this ROM and throwing
       inside system_server while doing it; it is not this app's exception, nothing in the
       app's own logcat stream reports an error, and the chirp plays.

       What reuse is actually worth: one context rather than one per alarm (no unbounded
       accumulation of hardware clients over a wall panel's uptime), and an app run that
       never rings never opens audio at all. Keep it for those reasons.
       (MainActivity sets setMediaPlaybackRequiresUserGesture(false), and by the time a
       countdown ends the user has necessarily touched the panel, so no gesture is lost.) */
    openAudio: function () {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!this.audio) this.audio = new Ctx();
        if (this.audio.state === "suspended" && this.audio.resume) this.audio.resume();
      } catch (e) { this.audio = null; }
      return this.audio;
    },
    /* Short chirp. Optional by design — a muted or audio-less panel just gets the visual
       alarm, so any failure here is swallowed. */
    beep: function () {
      try {
        var ac = this.openAudio();
        if (!ac) return;
        [0, 0.35, 0.7].forEach(function (offset) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = "sine"; o.frequency.value = 880;
          g.gain.setValueAtTime(0.001, ac.currentTime + offset);
          g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + offset + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + offset + 0.25);
          o.connect(g); g.connect(ac.destination);
          o.start(ac.currentTime + offset); o.stop(ac.currentTime + offset + 0.3);
        });
      } catch (e) { /* no audio on this panel — visual alarm still fires */ }
    },

    onOpen: function (panel) {
      this.panel = panel;
      this.renderPanel();
    },
    onClose: function () { this.panel = null; },

    /* Fast path: only the digits (and the countdown bar) move between frames. */
    tickPanel: function () {
      var disp = $("tmr-disp");
      if (!disp) { this.renderPanel(); return; }
      if (this.mode === "stopwatch") {
        disp.textContent = fmt.stopwatch(this.swElapsed(), true);
      } else {
        var r = this.cdRemain();
        disp.textContent = fmt.countdown(r);
        var fill = $("tmr-bar");
        if (fill) fill.style.width =
          (this.cd.duration ? Math.max(0, Math.min(100, (r / this.cd.duration) * 100)) : 0) + "%";
        var box = $("tmr-box");
        if (box) box.classList.toggle("alarm-flash", this.ringing);
      }
    },

    renderPanel: function () {
      var self = this;
      var panel = this.panel || WP.panels.el("timer");
      if (!panel || !WP.panels.isOpen("timer")) return;
      this.lastKey = this.stateKey();
      var body = WP.qs("[data-body]", panel);
      WP.qs("[data-sub]", panel).textContent =
        this.mode === "stopwatch" ? "counting up" : "counting down";

      /* Mode switch, readout and controls are one pinned cluster (.stick) under the panel
         header; only the lap list scrolls. Past ~9 laps the list used to push the running
         time AND the Lap button off the top, so reading lap 1 cost you the control you
         needed to take lap 15. The mode tabs are inside the pinned block rather than above
         it because .stick cancels the panel body's top padding with a negative margin —
         anything left above it gets painted over. */
      var html = '<div class="stick">'
        + segmented("timer", "mode", [["stopwatch", "Stopwatch"], ["countdown", "Timer"]], this.mode);

      if (this.mode === "stopwatch") {
        var e = this.swElapsed();
        html += '<div class="big-readout"><div class="big-time mono" id="tmr-disp">'
          + fmt.stopwatch(e, true) + "</div></div>"
          + '<div class="btn-row">'
          + btn("sw-toggle", this.sw.running ? "Stop" : "Start",
                this.sw.running ? "danger" : "primary", null, "timer")
          + btn("sw-lap", "Lap", this.sw.running ? "" : "off", null, "timer")
          + btn("sw-reset", "Reset", "", null, "timer")
          + "</div></div>";
        /* Splits are differences of the *displayed* totals, so the two columns always
           reconcile — see fmt.swQuantise. */
        html += section("Laps (" + this.sw.laps.length + ")", this.sw.laps.length
          ? '<div class="laps">' + this.sw.laps.map(function (t, i, arr) {
              var cur = fmt.swQuantise(t), prev = fmt.swQuantise(arr[i + 1] || 0);
              return '<div class="lap"><span class="lap-n">#' + (arr.length - i) + "</span>"
                + '<span class="lap-t mono">' + fmt.stopwatch(cur, true) + "</span>"
                + '<span class="lap-d mono">+' + fmt.stopwatch(cur - prev, true) + "</span></div>";
            }).join("") + "</div>"
          : '<div class="muted">Tap Lap while running to split.</div>');

      } else {
        var r = this.cdRemain();
        var pct = this.cd.duration ? (r / this.cd.duration) * 100 : 0;
        html += '<div class="big-readout' + (this.ringing ? " alarm-flash" : "") + '" id="tmr-box">'
          + '<div class="big-time mono" id="tmr-disp">' + fmt.countdown(r) + "</div>"
          + '<div class="bar"><div class="bar-fill accent" id="tmr-bar" style="width:'
          + pct.toFixed(1) + '%"></div></div></div>'
          + '<div class="btn-row">'
          + btn("cd-toggle", this.cd.running ? "Pause" : "Start",
                this.cd.running ? "danger" : "primary", null, "timer")
          + btn("cd-bump", "+1 min", "", 60, "timer")
          + btn("cd-bump", "&minus;1 min", "", -60, "timer")
          + btn("cd-reset", "Reset", "", null, "timer")
          + "</div></div>"
          /* Chips, not buttons: a preset is a *choice*, so the one currently loaded is
             highlighted the same way every other segmented control in the app is.
             +1/-1 min moves the duration off every preset, and then none is lit. */
          + section("Presets", '<div class="chip-row">'
              + [1, 3, 5, 10, 15, 20, 30, 60].map(function (m) {
                  return '<button class="chip tappable'
                    + (self.cd.duration === m * 60000 ? " on" : "") + '"'
                    + ' data-ns="timer" data-act="cd-preset" data-arg="' + (m * 60) + '">'
                    + m + " min</button>";
                }).join("") + "</div>");
      }
      /* Scroll-preserving: taking lap 15 rebuilds this whole body, and dropping the offset
         would throw a reader who had scrolled back to lap 1 up to the top. */
      WP.repaint(body, html);
    }
  };

  /* =========================================================================
     3. WEATHER — real Open-Meteo, no API key
     One fetch feeds the "now", "hourly" and "daily" cards. The last good payload is
     cached in localStorage so a failed refresh shows the previous reading with a
     "stale" badge instead of an empty card.
     ========================================================================= */
  var WX_CACHE = "inky.wx.v2";

  var weather = {
    name: "weather",
    data: null,
    fetchedAt: 0,
    stale: false,
    subs: [],
    lastHour: -1,   // wall-clock hour of the last rollover check; see init()

    onData: function (fn) { this.subs.push(fn); },

    init: function () {
      var loc = C.location || {};
      if (loc.latitude == null || loc.longitude == null) {
        $("wx-temp").textContent = "--°";
        $("wx-desc").textContent = "No location set";
        $("wx-meta").textContent = "Set latitude/longitude in assets/config.js, then rebuild";
        WP.status("Weather disabled — no location in config.js", true);
        return;
      }
      /* Paint from cache first so the panel is never blank while the request is in
         flight (or forever, if the wifi is down at boot). */
      var cached = WP.store.readJSON(WX_CACHE, null);
      if (cached && cached.d) {
        this.data = cached.d;
        this.fetchedAt = cached.t || 0;
        this.stale = true;
        this.publish();
      }
      this.fetch();
      setInterval(this.fetch.bind(this), (C.weatherRefreshMinutes || 15) * 60 * 1000);

      /* Refetch on the hour boundary as well as on the refresh timer.
         Why: the hourly strip re-anchors itself the moment the wall clock crosses into a
         new hour (its own 15 s tick watches nowIndex), but the big "Now" temperature only
         changes when a fetch lands. Between a rollover and the next scheduled fetch the
         two disagree on screen — observed live as "65°" on the Now card beside "NOW 66°"
         in the strip, because the card still held the 6:55 reading while the strip had
         advanced to the 07:00 slot. Same instant, two different current temperatures.
         Refetching on the rollover keeps every card sourced from one payload, and costs
         at most one extra request per hour. */
      setInterval(function () {
        var h = new Date().getHours();
        if (weather.lastHour === h) return;
        weather.lastHour = h;
        if (weather.fetchedAt) weather.fetch();   // skip the boot pass; init() already fetched
      }, 15000);

      /* Changing units re-requests rather than converting locally: Open-Meteo will hand
         back mph/inch or km/h/mm to match, so every derived field stays consistent.
         The status line embeds a formatted clock, so a 12/24h flip has to redraw it too —
         otherwise the header keeps saying "Updated 11:31 PM" above a 23:31 clock until the
         next fetch, up to 15 minutes later. */
      S.onChange(function (k) {
        if (k === "units" || k === "*") weather.fetch();
        else if (k === "clockHours") weather.showStatus();
      });
    },

    /* Single source of truth for the status line, so it can be redrawn at any time from
       state instead of only at the moment a fetch lands. */
    showStatus: function () {
      if (this.stale) {
        if (!this.data) return;
        WP.status("Offline — showing last reading"
          + (this.fetchedAt ? " (" + fmt.ago(this.fetchedAt) + ")" : ""), true);
      } else if (this.fetchedAt) {
        WP.status("Updated " + fmt.clock(new Date(this.fetchedAt), false));
      }
    },

    url: function () {
      var loc = C.location;
      var metric = S.isMetric();
      return "https://api.open-meteo.com/v1/forecast"
        + "?latitude=" + encodeURIComponent(loc.latitude)
        + "&longitude=" + encodeURIComponent(loc.longitude)
        + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation"
          + ",weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m"
          + ",wind_direction_10m,wind_gusts_10m"
        + "&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m"
          + ",precipitation_probability,precipitation,weather_code,cloud_cover,visibility"
          + ",wind_speed_10m,wind_direction_10m,uv_index,is_day"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max"
          + ",apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max"
          + ",precipitation_sum,precipitation_probability_max,wind_speed_10m_max"
          + ",wind_gusts_10m_max,wind_direction_10m_dominant"
        + "&temperature_unit=" + (metric ? "celsius" : "fahrenheit")
        + "&wind_speed_unit=" + (metric ? "kmh" : "mph")
        + "&precipitation_unit=" + (metric ? "mm" : "inch")
        + "&timezone=auto&forecast_days=7";
    },

    fetch: function () {
      var self = this;
      if (!C.location || C.location.latitude == null) return;
      fetch(this.url(), { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (d) {
          self.data = d;
          self.fetchedAt = Date.now();
          self.stale = false;
          WP.store.writeJSON(WX_CACHE, { t: self.fetchedAt, u: S.get("units"), d: d });
          self.publish();
          self.showStatus();
        })
        .catch(function (e) {
          /* Offline: keep the last reading on screen and badge it, never blank the card. */
          self.stale = true;
          self.publish();
          if (self.data) self.showStatus();
          else WP.status("Weather unavailable (" + e.message + ")", true);
        });
    },

    publish: function () {
      this.render();
      this.subs.forEach(function (fn) {
        try { fn(weather.data, weather.stale); } catch (e) { console.error("wx sub: " + e.message); }
      });
      /* Three of the home cards just changed size (an empty card is a fraction of the
         height of a loaded one), and the growth caps are measured off exactly that. */
      WP.relayoutHome();
    },

    /* index into hourly[] for the hour we are currently inside */
    nowIndex: function () {
      var d = this.data;
      if (!d || !d.hourly || !d.hourly.time) return -1;
      var now = Date.now();
      for (var i = 0; i < d.hourly.time.length; i++) {
        var t = new Date(d.hourly.time[i]).getTime();
        if (t <= now && now < t + 3600000) return i;
      }
      return 0;
    },

    render: function () {
      var d = this.data;
      if (!d || !d.current) return;
      var cur = d.current;
      var info = WP.wmo(cur.weather_code, cur.is_day === 0);

      $("wx-icon").textContent = info.icon;
      $("wx-temp").textContent = fmt.deg(cur.temperature_2m);
      $("wx-desc").textContent = info.text;
      $("wx-badge").hidden = !this.stale;

      $("wx-quick").innerHTML =
        '<div class="wxq"><span class="wxq-k">Feels</span><span class="wxq-v">'
          + fmt.deg(cur.apparent_temperature) + "</span></div>"
        + '<div class="wxq"><span class="wxq-k">Wind</span><span class="wxq-v">'
          + Math.round(cur.wind_speed_10m) + " " + fmt.speedUnit() + "</span></div>"
        + '<div class="wxq"><span class="wxq-k">Hum</span><span class="wxq-v">'
          + Math.round(cur.relative_humidity_2m) + "%</span></div>";

      var i = this.nowIndex();
      var bits = [];
      if (C.location && C.location.name) bits.push(C.location.name);
      if (d.daily && d.daily.temperature_2m_max) {
        bits.push("H " + fmt.deg(d.daily.temperature_2m_max[0])
          + " / L " + fmt.deg(d.daily.temperature_2m_min[0]));
      }
      if (i >= 0 && d.hourly.uv_index) {
        var uv = fmt.uv(d.hourly.uv_index[i]);
        bits.push("UV " + uv.n + " " + uv.label);
      }
      if (this.stale) bits.push("last update " + fmt.ago(this.fetchedAt));
      $("wx-meta").textContent = bits.join("   ·   ");
    },

    onOpen: function (panel) {
      var body = WP.qs("[data-body]", panel);
      var d = this.data;
      WP.qs("[data-sub]", panel).textContent = (C.location && C.location.name)
        ? C.location.name + (this.stale ? " · stale" : " · live")
        : "current conditions";

      if (!d || !d.current) {
        body.innerHTML = '<div class="muted">No weather data yet. '
          + "The panel retries every " + (C.weatherRefreshMinutes || 15) + " minutes.</div>";
        return;
      }

      var cur = d.current, i = this.nowIndex(), h = d.hourly, day = d.daily;
      var info = WP.wmo(cur.weather_code, cur.is_day === 0);
      var uv = fmt.uv(h && h.uv_index && i >= 0 ? h.uv_index[i] : (day ? day.uv_index_max[0] : null));

      var sunrise = day && day.sunrise ? new Date(day.sunrise[0]) : null;
      var sunset = day && day.sunset ? new Date(day.sunset[0]) : null;
      var dayLen = day && day.daylight_duration ? fmt.duration(day.daylight_duration[0] * 1000) : "--";

      body.innerHTML =
        '<div class="big-readout">'
        + '<div class="big-icon">' + info.icon + "</div>"
        + '<div class="big-time">' + fmt.deg(cur.temperature_2m) + "</div>"
        + '<div class="big-sub">' + esc(info.text) + " · feels "
          + fmt.deg(cur.apparent_temperature) + "</div></div>"

        + section("Air", statGrid([
            ["Humidity", Math.round(cur.relative_humidity_2m) + "%"],
            ["Dew point", h && h.dew_point_2m && i >= 0 ? fmt.deg(h.dew_point_2m[i]) : "--"],
            ["Pressure", fmt.pressure(cur.pressure_msl)],
            ["Cloud cover", Math.round(cur.cloud_cover) + "%"],
            ["Visibility", h && h.visibility && i >= 0 ? fmt.distance(h.visibility[i]) : "--"],
            ["UV index", uv.n + "", uv.label]
          ]))

        + section("Wind", statGrid([
            ["Speed", Math.round(cur.wind_speed_10m) + " " + fmt.speedUnit()],
            ["Gusts", Math.round(cur.wind_gusts_10m) + " " + fmt.speedUnit()],
            /* The arrow belongs with Direction, not in a cell of its own labelled "Arrow" —
               that labelled a decoration as if it were a measurement, and sat next to the
               Direction cell already carrying the same fact. It points where the wind is
               blowing toward, i.e. bearing + 180. */
            ["Direction", fmt.compass(cur.wind_direction_10m)
              + ' <span class="wind-arrow" style="transform:rotate('
              + Math.round(cur.wind_direction_10m + 180) + 'deg)">&uarr;</span>',
              Math.round(cur.wind_direction_10m) + "° · blowing toward"]
          ]))

        + section("Sun", statGrid([
            ["Sunrise", sunrise ? esc(fmt.clock(sunrise, false)) : "--"],
            ["Sunset", sunset ? esc(fmt.clock(sunset, false)) : "--"],
            ["Daylight", esc(dayLen)],
            ["Now", cur.is_day ? "Daytime" : "Night"]
          ]))

        + section("Precipitation", statGrid([
            ["Right now", (cur.precipitation || 0) + " " + fmt.precipUnit()],
            ["Chance (next h)", h && h.precipitation_probability && i >= 0
              ? Math.round(h.precipitation_probability[i]) + "%" : "--"],
            ["Today total", day ? (Math.round(day.precipitation_sum[0] * 100) / 100)
              + " " + fmt.precipUnit() : "--"],
            ["Today max chance", day && day.precipitation_probability_max
              ? Math.round(day.precipitation_probability_max[0]) + "%" : "--"]
          ]))

        + section("Source", '<div class="muted">Open-Meteo · no API key · '
            + (this.stale ? "cached " + esc(fmt.ago(this.fetchedAt))
                          : "fetched " + esc(fmt.ago(this.fetchedAt)))
            + " · lat/lon from assets/config.js</div>");
    }
  };

  /* =========================================================================
     4. HOURLY FORECAST — real Open-Meteo
     Home card is a horizontally scrollable 24-hour strip; every hour is tappable and
     opens the panel focused on that hour.
     ========================================================================= */
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
        return '<button class="hr tappable' + (i === now ? " now" : "") + '"'
          + ' data-open="hourly" data-arg="' + i + '">'
          + '<div class="hr-t">' + esc(i === now ? "Now" : fmt.hourLabel(t)) + "</div>"
          + '<div class="hr-i">' + info.icon + "</div>"
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
      var readout = '<div class="big-readout">'
        + '<div class="big-icon">' + info.icon + "</div>"
        + '<div class="big-time">' + fmt.deg(h.temperature_2m[i]) + "</div>"
        + '<div class="big-sub">' + esc(info.text) + " · feels "
        + fmt.deg(h.apparent_temperature[i]) + "</div></div>"
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
          ]);

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
          + ' data-ns="hourly" data-act="pick" data-arg="' + k + '">'
          + '<span class="hrow-t">' + esc(fmt.hourLabel(tk)) + "</span>"
          + '<span class="hrow-i">' + ik.icon + "</span>"
          + '<span class="hrow-bar"><span style="width:' + w.toFixed(1) + '%"></span></span>'
          + '<span class="hrow-d">' + fmt.deg(h.temperature_2m[k]) + "</span>"
          + '<span class="hrow-p' + (pop >= 30 ? " wet" : "") + '">' + pop + "%</span>"
          + "</button>";
      }).join("");

      /* Scroll-preserving: tapping a row in the list must not throw the list back to the
         top, which is the whole reason picking an hour does not re-scroll. */
      WP.repaint(body, readout + section("Next 24 hours — tap to inspect",
        '<div class="hrows">' + rows + "</div>"));

      /* Opening on hour 21 of 24 used to highlight a row 21 rows below the fold. Put the
         selected row on screen. Measured with rects rather than offsetTop because the
         scroller (.panel-body) is not the offset parent — the .panel is.

         Deliberately still 0.42, against the review note asking for 0.25 so the headline
         readout stays visible for a late hour. Two reasons. The factor works the other way
         round: scrollTop += delta - clientHeight * f, so a *smaller* f scrolls further and
         hides more of what is above, not less. And for a late hour it changes nothing at
         all, because the body is already pinned at its maximum scroll — measured on device,
         the readout block is ~45vh against a ~79vh scrollport, so no scroll position that
         also shows row 21 of 24 can include it. Keeping the headline for a late hour needs
         the readout pinned or the list given its own scroller, which is a bigger change to
         a working panel than this item is worth. The selected hour is still named in the
         panel subtitle ("Monday · 23:00") and its row is highlighted. */
      if (scrollToSel) {
        var sel = WP.qs(".hrow.sel", body);
        if (sel) {
          var delta = sel.getBoundingClientRect().top - body.getBoundingClientRect().top;
          body.scrollTop += delta - body.clientHeight * 0.42;
        }
      }
    }
  };

  /* =========================================================================
     5. DAILY FORECAST — real Open-Meteo
     ========================================================================= */
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
        html += '<button class="fc-day tappable" data-open="daily" data-arg="' + i + '">'
          + '<div class="fc-name">' + esc(i === 0 ? "Today"
              : dt.toLocaleDateString(undefined, { weekday: "short" })) + "</div>"
          + '<div class="fc-icon">' + info.icon + "</div>"
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
      var tabs = '<div class="chip-row">' + day.time.map(function (iso, k) {
        var dk = new Date(iso + "T12:00:00");
        return '<button class="chip tappable' + (k === i ? " on" : "") + '"'
          + ' data-ns="daily" data-act="pick" data-arg="' + k + '">'
          + esc(k === 0 ? "Today" : dk.toLocaleDateString(undefined, { weekday: "short" }))
          + "</button>";
      }).join("") + "</div>";

      var sunrise = new Date(day.sunrise[i]), sunset = new Date(day.sunset[i]);

      /* hour-by-hour temperature bars for the selected day, straight from hourly[] */
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
          barsHtml = '<div class="daybars">' + idx.map(function (k, n) {
            var h = 14 + ((d.hourly.temperature_2m[k] - lo) / span) * 86;
            var showLabel = (n % 3 === 0);
            return '<div class="daybar">'
              + '<div class="daybar-v">' + (showLabel ? fmt.deg(d.hourly.temperature_2m[k]) : "") + "</div>"
              + '<div class="daybar-c"><div style="height:' + h.toFixed(1) + '%"></div></div>'
              + '<div class="daybar-t">' + (showLabel
                  ? esc(fmt.hourLabel(new Date(d.hourly.time[k]))) : "") + "</div></div>";
          }).join("") + "</div>";
        }
      }

      WP.repaint(body, tabs
        + '<div class="big-readout">'
        + '<div class="big-icon">' + info.icon + "</div>"
        + '<div class="big-time">' + fmt.deg(day.temperature_2m_max[i])
          + ' <span class="dim">/ ' + fmt.deg(day.temperature_2m_min[i]) + "</span></div>"
        + '<div class="big-sub">' + esc(info.text) + "</div></div>"

        + section("Day", statGrid([
            ["Feels high", fmt.deg(day.apparent_temperature_max[i])],
            ["Feels low", fmt.deg(day.apparent_temperature_min[i])],
            ["Rain chance", Math.round(day.precipitation_probability_max[i] || 0) + "%"],
            ["Precip total", (Math.round((day.precipitation_sum[i] || 0) * 100) / 100)
              + " " + fmt.precipUnit()],
            ["Max wind", Math.round(day.wind_speed_10m_max[i]) + " " + fmt.speedUnit(),
              fmt.compass(day.wind_direction_10m_dominant[i])],
            ["Max gusts", Math.round(day.wind_gusts_10m_max[i]) + " " + fmt.speedUnit()],
            ["UV max", String(fmt.uv(day.uv_index_max[i]).n), fmt.uv(day.uv_index_max[i]).label],
            ["Daylight", esc(fmt.duration(day.daylight_duration[i] * 1000))],
            ["Sunrise", esc(fmt.clock(sunrise, false))],
            ["Sunset", esc(fmt.clock(sunset, false))]
          ]))
        + section("Hour by hour", barsHtml));
    }
  };

  /* =========================================================================
     6. HOME ASSISTANT — simulator by default, real REST API when configured
     No token is bundled (the repo is public), so the default is a genuine simulator:
     every numeric entity is a mean-reverting random walk around a time-of-day curve,
     seeded deterministically per entity so two hours of plausible history exist the
     instant the panel boots. Toggles hold state and feed back into the model — turning
     the lamp on really does warm the living room and add watts.
     ========================================================================= */
  var HA_STATE_KEY = "inky.ha.v1";

  /* deterministic PRNG so seeded history is stable across a repaint */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var sensors = {
    name: "sensors",
    mode: "demo",          // "demo" | "live"
    sel: null,
    ents: [],
    tickMs: 5000,
    sampleMs: 30000,
    lastSample: 0,

    /* Simulated home. `phase` is the hour of day at which the daily curve peaks; `short`
       is what fits a home tile (five across), `label` is used everywhere with room.

       Two knobs give each quantity its own physics. `tau` is the time constant with which
       it chases its target — a room has thermal mass and takes a quarter of an hour to
       react to a lamp, while household power follows the load in seconds. `noise` is the
       random kick per 5 s tick, sized so the resulting standing jitter is about ±0.1 °F for
       a room rather than the ±1 °F of noise it used to be. `dwell` is the plausible range
       of on / off run lengths for switch-like entities, used both to synthesise their past
       and to drive the door's live flips. */
    /* Glyphs are text-presentation symbols from the Geometric Shapes / Misc Symbols blocks,
       not emoji. The row used to be 🌡🛏🌤💧🫁⚡💡🌀🚪, which Android renders as full-colour
       sprites sitting beside the weather widgets' crisp white line glyphs.

       Switch-like entities carry TWO glyphs and swap on state: filled = energised, hollow =
       not. A lamp that was off still drew the same lit bulb as a lamp that was on, so from
       across the room the giant yellow bulb said "on" while the text underneath said Off.
       Filled-vs-hollow is legible at 2-4 m in a way that a colour shift is not. */
    demoDefs: [
      { id: "sensor.living_room_temperature", label: "Living room", short: "Living", icon: "⌂",
        unit: "°F", base: 72.5, amp: 2.4, phase: 16,
        tau: 900000, noise: 0.018, min: 62, max: 84, dp: 1 },
      { id: "sensor.bedroom_temperature", label: "Bedroom", short: "Bed", icon: "☾",
        unit: "°F", base: 70.0, amp: 1.9, phase: 15,
        tau: 900000, noise: 0.016, min: 60, max: 82, dp: 1 },
      { id: "sensor.outside_temperature", label: "Outside", short: "Outside", icon: "☀",
        unit: "°F", base: 68.0, amp: 11.0, phase: 16,
        tau: 600000, noise: 0.056, min: 38, max: 105, dp: 1 },
      { id: "sensor.living_room_humidity", label: "Humidity", short: "Humid", icon: "☂",
        unit: "%", base: 46, amp: 7, phase: 4,
        tau: 600000, noise: 0.11, min: 22, max: 78, dp: 0 },
      { id: "sensor.living_room_co2", label: "CO₂", short: "CO₂", icon: "≈",
        unit: "ppm", base: 640, amp: 190, phase: 21,
        tau: 300000, noise: 3.8, min: 400, max: 1800, dp: 0 },
      { id: "sensor.house_power", label: "Power", short: "Power", icon: "↯",
        unit: "W", base: 430, amp: 210, phase: 19,
        tau: 60000, noise: 18, min: 80, max: 4200, dp: 0 },
      { id: "light.living_room_lamp", label: "Lamp", short: "Lamp", icon: "●", iconOff: "○",
        kind: "toggle", domain: "light",
        dwell: { on: [25 * 60000, 95 * 60000], off: [18 * 60000, 70 * 60000] } },
      { id: "switch.office_fan", label: "Office fan", short: "Fan", icon: "◆", iconOff: "◇",
        kind: "toggle", domain: "switch",
        dwell: { on: [12 * 60000, 40 * 60000], off: [22 * 60000, 90 * 60000] } },
      { id: "binary_sensor.front_door", label: "Front door", short: "Door", icon: "▯",
        iconOff: "▮", kind: "binary", onText: "Open", offText: "Closed",
        dwell: { on: [40000, 160000], off: [7 * 60000, 25 * 60000] } }
    ],

    init: function () {
      var ha = C.homeAssistant || {};
      this.mode = (ha.enabled && ha.baseUrl && ha.token) ? "live" : "demo";
      $("ha-badge").textContent = this.mode === "live" ? "live" : "demo";
      $("ha-badge").className = "badge " + (this.mode === "live" ? "badge-live" : "badge-demo");

      if (this.mode === "live") this.initLive(ha); else this.initDemo();

      var self = this;
      WP.onAction("sensors", function (act, arg) {
        if (act === "toggle") { self.toggle(arg); }
        else if (act === "pick") { self.sel = arg; self.paintPanel(); }
      });

      /* °F/°C flips have to reach the tiles straight away, not on the next 5 s tick */
      S.onChange(function () { self.render(); self.paintPanel(); });

      /* Demo and live run on deliberately different clocks. `tickMs` is the *simulation*
         step: the model's per-step random kick is scaled against it (see noiseFor), so it is
         a tuning constant and not something a config file may move. The live path is a
         network poll of somebody else's Home Assistant box, and that is what
         `homeAssistant.refreshSeconds` was always meant to be — it was documented as
         configuration while no code read it, which is worse than not offering it. Floored at
         5 s so a mistyped 0 or -1 cannot turn the panel into a request loop against HA. */
      this.livePollMs = Math.max(5000, Math.round((+ha.refreshSeconds || 60) * 1000));
      setInterval(this.tick.bind(this),
                  this.mode === "live" ? this.livePollMs : this.tickMs);
      this.tick();
    },

    /* ---- demo simulator ----
       The seeded history is a synthetic *past*, not a copy of the present. Filling all 240
       samples with the entity's current state used to make the detail panel contradict
       itself for a full two hours after any toggle ("State now: Off" beside "On: 100% of
       window"). Switches are walked backwards from their current state in randomised runs;
       numerics are then integrated forward along that same timeline, so the lamp having
       been on an hour ago shows up in the living-room temperature an hour ago too. */
    windowMs: 7200000,

    /* Both the seed and the forward stepper use these, so a 30 s seed step and a 5 s
       simulation step produce the same statistics and the trace has no seam where one hands
       over (this pair is the demo model only; live mode reads real states): the pull
       toward target decays over the entity's own time constant, and the random kick scales
       as sqrt(dt) like any diffusion. */
    reversion: function (def, dtMs) { return 1 - Math.exp(-dtMs / (def.tau || 300000)); },
    noiseFor: function (def, dtMs) { return def.noise * Math.sqrt(dtMs / sensors.tickMs); },

    initDemo: function () {
      var saved = WP.store.readJSON(HA_STATE_KEY, {}) || {};
      var now = Date.now();
      var step = this.sampleMs;
      var times = [];
      for (var t = now - this.windowMs; t <= now; t += step) times.push(t);

      this.ents = this.demoDefs.map(function (def) {
        return {
          id: def.id, label: def.label, short: def.short || def.label,
          icon: def.icon, iconOff: def.iconOff, unit: def.unit || "",
          kind: def.kind || "numeric", domain: def.domain, dp: def.dp,
          def: def, hist: [], on: !!saved[def.id], last: now
        };
      });

      /* switches first — the numeric model reads their timeline as it integrates */
      var sw = {};
      this.ents.forEach(function (e) {
        if (e.kind === "numeric") return;
        if (e.kind === "binary") e.on = false;          // the door starts closed
        sensors.seedSwitch(e, times, now);
        sw[e.id] = e;
      });
      function at(e, i) { return !!(e && e.hist[i] && e.hist[i].v >= 0.5); }
      function flagsAt(i) {
        return {
          lamp: at(sw["light.living_room_lamp"], i),
          fan:  at(sw["switch.office_fan"], i),
          door: at(sw["binary_sensor.front_door"], i)
        };
      }

      this.ents.forEach(function (e) {
        if (e.kind !== "numeric") return;
        var rnd = mulberry32(hashStr(e.id));
        var k = sensors.reversion(e.def, step), n = sensors.noiseFor(e.def, step);
        var v = sensors.target(e.def, new Date(times[0]), flagsAt(0));
        e.hist = times.map(function (ts, i) {
          var tgt = sensors.target(e.def, new Date(ts), flagsAt(i));
          v += (tgt - v) * k + (rnd() * 2 - 1) * n;
          v = Math.max(e.def.min, Math.min(e.def.max, v));
          return { t: ts, v: v };
        });
        e.value = v;
      });
      this.lastSample = now;
    },

    /* Walk an on/off entity backwards from its current state in randomised dwell times and
       sample the resulting runs onto the shared grid. The newest run is only partly
       elapsed (the state did not change the instant the app booted), and the last sample is
       by construction the current state, so the seeded past joins the live data with no
       invented step. Deterministic per entity id. */
    seedSwitch: function (e, times, now) {
      var d = (e.def && e.def.dwell) || { on: [1500000, 3600000], off: [1500000, 3600000] };
      var rnd = mulberry32(hashStr(e.id + "|runs"));
      function span(on) { var r = on ? d.on : d.off; return r[0] + rnd() * (r[1] - r[0]); }

      var segs = [], end = now, v = e.on ? 1 : 0, first = true, full = 0, part = 0;
      while (end > times[0]) {
        var dur = span(v === 1);
        if (first) { full = dur; part = dur * (0.10 + rnd() * 0.75); dur = part; first = false; }
        segs.push({ from: end - dur, to: end, v: v });
        end -= dur;
        v = 1 - v;
      }
      segs.reverse();                                   // oldest first
      var si = 0;
      e.hist = times.map(function (ts) {
        while (si < segs.length - 1 && ts >= segs[si].to) si++;
        return { t: ts, v: segs[si].v };
      });
      e.last = segs[segs.length - 1].from;              // when the current run began
      /* the door's live stepper carries on from where the seeded run left off */
      if (e.kind === "binary") e.nextFlip = now + Math.max(20000, full - part);
    },

    /* Where the model is pulling toward right now: a base level plus a daily sinusoid,
       plus the effect of whatever is switched on. */
    target: function (def, when, flags) {
      var h = when.getHours() + when.getMinutes() / 60;
      var v = def.base + def.amp * Math.sin(2 * Math.PI * (h - def.phase + 6) / 24);
      if (def.id === "sensor.living_room_temperature" && flags.lamp) v += 1.4;
      if (def.id === "sensor.bedroom_temperature" && flags.fan) v -= 0.9;
      if (def.id === "sensor.house_power") {
        if (flags.lamp) v += 9;
        if (flags.fan) v += 48;
      }
      if (def.id === "sensor.living_room_co2" && flags.door) v -= 220;
      if (def.id === "sensor.living_room_humidity" && flags.door) v += 4;
      return v;
    },

    flags: function () {
      var f = {};
      this.ents.forEach(function (e) {
        if (e.id === "light.living_room_lamp") f.lamp = e.on;
        if (e.id === "switch.office_fan") f.fan = e.on;
        if (e.id === "binary_sensor.front_door") f.door = e.on;
      });
      return f;
    },

    /* Keep the trace honest about its own label: drop anything older than the two-hour
       window rather than counting samples, because toggles add off-grid ones. */
    trimHist: function (e, now) {
      var cut = now - sensors.windowMs;
      while (e.hist.length > 2 && e.hist[0].t < cut) e.hist.shift();
      if (e.hist.length > 800) e.hist.splice(0, e.hist.length - 800);
    },

    sample: function (e, now) {
      e.hist.push({ t: now, v: e.kind === "numeric" ? e.value : (e.on ? 1 : 0) });
      sensors.trimHist(e, now);
    },

    stepDemo: function () {
      var now = Date.now(), f = this.flags(), takeSample = (now - this.lastSample >= this.sampleMs);

      this.ents.forEach(function (e) {
        if (e.kind === "numeric") {
          var tgt = sensors.target(e.def, new Date(now), f);
          e.value += (tgt - e.value) * sensors.reversion(e.def, sensors.tickMs)
            + (Math.random() * 2 - 1) * sensors.noiseFor(e.def, sensors.tickMs);
          e.value = Math.max(e.def.min, Math.min(e.def.max, e.value));
        } else if (e.kind === "binary" && now >= e.nextFlip) {
          /* a door that opens for a minute or two, then closes for several — the same
             dwell ranges the seeded history was built from */
          var d = e.def.dwell;
          e.on = !e.on;
          var r = e.on ? d.on : d.off;
          e.nextFlip = now + r[0] + Math.random() * (r[1] - r[0]);
          e.last = now;
          sensors.sample(e, now);          // show the edge immediately, not up to 30 s late
          return;
        }
        if (takeSample) sensors.sample(e, now);
      });
      if (takeSample) this.lastSample = now;
    },

    /* ---- real Home Assistant ---- */
    initLive: function (ha) {
      this.base = ha.baseUrl.replace(/\/+$/, "");
      this.token = ha.token;
      this.ents = (ha.entities || []).map(function (cfg) {
        var domain = String(cfg.id).split(".")[0];
        return {
          id: cfg.id, label: cfg.label || cfg.id, short: cfg.label || cfg.id,
          icon: "•", unit: cfg.unit || "",
          kind: (domain === "light" || domain === "switch" || domain === "fan")
            ? "toggle" : "numeric",
          domain: domain, hist: [], value: null, on: false, dp: 1
        };
      });
    },

    haHeaders: function () {
      return { "Authorization": "Bearer " + this.token, "Content-Type": "application/json" };
    },

    stepLive: function () {
      var self = this, now = Date.now();
      Promise.all(this.ents.map(function (e) {
        return fetch(self.base + "/api/states/" + encodeURIComponent(e.id),
          { headers: self.haHeaders(), cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (j) {
            e.err = null;
            e.attrs = j.attributes || {};
            if (e.kind === "toggle") { e.on = (j.state === "on"); e.value = e.on ? 1 : 0; }
            else {
              var n = parseFloat(j.state);
              e.value = isNaN(n) ? null : n;
              if (!e.unit) e.unit = e.attrs.unit_of_measurement || "";
            }
            e.hist.push({ t: now, v: e.value });
            /* Trim by age, not by sample count: the poll interval is configurable now, so a
               fixed 240-sample cap would mean a different window for every refreshSeconds
               while the panel keeps calling it "Last 2 hours". */
            sensors.trimHist(e, now);
          })
          .catch(function (err) { e.err = err.message; });
      })).then(function () {
        var bad = self.ents.filter(function (e) { return e.err; }).length;
        if (bad) WP.status("Home Assistant: " + bad + " entity error(s) — check baseUrl/token", true);
        self.render();
        self.paintPanel();
      });
    },

    tick: function () {
      if (this.mode === "live") { this.stepLive(); return; }
      this.stepDemo();
      this.render();
      this.paintPanel();
    },

    /* Toggles are optimistic in demo mode and fire the real service call when live. */
    toggle: function (id) {
      var e = this.find(id);
      if (!e || (e.kind !== "toggle")) return;
      e.on = !e.on;
      e.last = Date.now();
      /* record the edge now: waiting for the next 30 s grid sample left the sparkline and
         the duty figures disagreeing with the state the tile was already showing */
      this.sample(e, e.last);
      WP.toast(e.label + " " + (e.on ? "on" : "off"));

      if (this.mode === "demo") {
        var saved = WP.store.readJSON(HA_STATE_KEY, {}) || {};
        saved[id] = e.on;
        WP.store.writeJSON(HA_STATE_KEY, saved);
      } else {
        fetch(this.base + "/api/services/" + e.domain + "/turn_" + (e.on ? "on" : "off"), {
          method: "POST", headers: this.haHeaders(),
          body: JSON.stringify({ entity_id: id })
        }).catch(function (err) { WP.status("HA service call failed: " + err.message, true); });
      }
      this.render();
      this.paintPanel();
    },

    find: function (id) {
      for (var i = 0; i < this.ents.length; i++) if (this.ents[i].id === id) return this.ents[i];
      return null;
    },

    /* Duty cycle has to be time-weighted, not a mean of samples: a toggle records an extra
       off-grid sample at the moment it is pressed, and an unweighted mean would count that
       instant as heavily as a 30 s interval. */
    duty: function (hist) {
      if (!hist || hist.length < 2) return null;
      var on = 0, total = 0;
      for (var i = 1; i < hist.length; i++) {
        var dt = hist[i].t - hist[i - 1].t;
        if (dt <= 0) continue;
        total += dt;
        if (hist[i - 1].v >= 0.5) on += dt;
      }
      return total ? on / total : null;
    },
    lastChange: function (hist) {
      for (var i = (hist || []).length - 1; i > 0; i--) {
        if ((hist[i].v >= 0.5) !== (hist[i - 1].v >= 0.5)) return hist[i].t;
      }
      return null;
    },

    /* The simulator models °F natively. Convert on the way out so demo entities honour the
       unit setting like everything else on the panel. A real Home Assistant reports its own
       units, so this only ever applies in demo mode. */
    isDemoF: function (e) { return sensors.mode === "demo" && e.unit === "°F"; },
    out: function (e, v) {
      if (v == null) return null;
      return (sensors.isDemoF(e) && S.isMetric()) ? (v - 32) * 5 / 9 : v;
    },
    outUnit: function (e) {
      return (sensors.isDemoF(e) && S.isMetric()) ? "°C" : (e.unit || "");
    },

    /* On/off entities draw the filled glyph only while they are actually on. */
    glyph: function (e) {
      return (e.iconOff && !e.on) ? e.iconOff : e.icon;
    },
    isOffish: function (e) {
      return (e.kind === "toggle" || e.kind === "binary") && !e.on;
    },

    display: function (e) {
      if (e.kind === "toggle") return e.on ? "On" : "Off";
      if (e.kind === "binary") return e.on ? (e.def.onText || "On") : (e.def.offText || "Off");
      if (e.value == null) return "--";
      /* Fixed decimals, not Math.round: dropping the trailing zero changed the string
         width, so the column jittered "72" / "71.9" / "72.1" every 30 s (and "22 °C"
         beside "20.2 °C"). Same rule is used for the min/max/mean stats below. */
      return Number(sensors.out(e, e.value)).toFixed(e.dp || 0);
    },

    render: function () {
      var box = $("sensors");
      if (!box) return;
      if (!this.ents.length) {
        box.innerHTML = '<div class="muted">No entities configured.</div>';
        return;
      }
      /* Skip this frame if a finger is down: replacing a tile mid-press would move the
         click target out from under the user and swallow the tap. */
      if (WP.touching()) return;
      box.innerHTML = this.ents.map(function (e) {
        var isSwitch = (e.kind === "toggle");
        /* toggles act on tap; readings open the detail panel */
        var attrs = isSwitch
          ? 'data-ns="sensors" data-act="toggle" data-arg="' + esc(e.id) + '"'
          : 'data-open="sensors" data-arg="' + esc(e.id) + '"';
        return '<button class="sensor tappable' + (isSwitch ? " has-sw" : "")
          + (isSwitch && e.on ? " on" : "")
          + (e.kind === "binary" && e.on ? " alertish" : "") + '" ' + attrs + ">"
          + '<div class="sensor-label">' + sensors.glyph(e) + " " + esc(e.short || e.label) + "</div>"
          + '<div class="sensor-value">' + esc(sensors.display(e))
          + '<span class="sensor-unit">' + esc(sensors.outUnit(e)) + "</span></div>"
          + (isSwitch ? '<div class="sensor-sw"><span></span></div>' : "")
          + "</button>";
      }).join("");
    },

    onOpen: function (panel, arg) {
      this.panel = panel;
      this.sel = arg || (this.ents[0] && this.ents[0].id);
      this.paintPanel();
    },
    onClose: function () { this.panel = null; },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("sensors");
      if (!panel || !WP.panels.isOpen("sensors") || WP.touching()) return;
      var body = WP.qs("[data-body]", panel);
      var e = this.find(this.sel) || this.ents[0];
      if (!e) { body.innerHTML = '<div class="muted">No entities.</div>'; return; }

      WP.qs("[data-sub]", panel).textContent = this.mode === "demo"
        ? "DEMO — simulated entities, no token configured"
        : "live · " + this.base;

      var chips = '<div class="chip-row">' + this.ents.map(function (x) {
        return '<button class="chip tappable' + (x.id === e.id ? " on" : "") + '"'
          + ' data-ns="sensors" data-act="pick" data-arg="' + esc(x.id) + '">'
          + sensors.glyph(x) + " " + esc(x.label) + "</button>";
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

      WP.repaint(body, chips
        + (this.mode === "demo"
            ? '<div class="demo-note">Simulated home — values drift on a real time-of-day '
              + "model and switches feed back into it (the lamp warms the living room and "
              + "adds watts). Set homeAssistant.enabled + token in assets/config.js for live "
              + "data.</div>"
            : "")
        + '<div class="big-readout"><div class="big-icon'
        + (this.isOffish(e) ? " dim" : "") + '">' + this.glyph(e) + "</div>"
        + '<div class="big-time">' + esc(this.display(e))
        + ' <span class="dim">' + esc(unit) + "</span></div>"
        + '<div class="big-sub">' + esc(e.label) + " · " + esc(e.id) + "</div></div>"
        + control
        + section("Last 2 hours", WP.sparkline(vals, spark)
            + statGrid(binary
                ? [["State now", esc(this.display(e))],
                   ["On", duty == null ? "--" : Math.round(duty * 100) + "% of window"],
                   ["Off", duty == null ? "--" : Math.round((1 - duty) * 100) + "% of window"],
                   ["Last change", changed ? esc(fmt.ago(changed)) : "over 2 h ago"]]
                : [["Min", r(min) + " " + esc(unit)],
                   ["Max", r(max) + " " + esc(unit)],
                   ["Mean", r(avg) + " " + esc(unit)],
                   ["Samples", String(e.hist.length)]]))
        + section("Entity", statGrid([
            ["Entity id", esc(e.id)],
            ["Domain", esc(e.domain || String(e.id).split(".")[0])],
            ["Source", this.mode === "demo" ? "simulator" : "REST API"],
            ["Updated", esc(fmt.ago(e.hist.length ? e.hist[e.hist.length - 1].t : Date.now()))]
          ])));
    }
  };

  /* =========================================================================
     7. DEVICE / SYSTEM — real values through the Android JS bridge
     MainActivity exposes one deviceInfo() call returning a JSON snapshot; doing it in a
     single call keeps the JS/Java hop off the render path.
     ========================================================================= */
  var system = {
    name: "system",
    info: null,

    init: function () {
      this.refresh();
      setInterval(this.refresh.bind(this), 5000);
    },

    refresh: function () {
      this.info = WP.bridge.json("deviceInfo");
      this.render();
      this.paintPanel();
    },

    render: function () {
      var big = $("sys-big"), sub = $("sys-sub");
      if (!big) return;
      var i = this.info;
      if (!i) {
        big.textContent = "n/a";
        sub.textContent = WP.bridge.present() ? "bridge error" : "no Android bridge";
        return;
      }
      /* "↯" (U+21AF), not "⚡" (U+26A1): the latter is an emoji-presentation codepoint and
         Android drew it as a colour sprite in an otherwise monochrome tile row. */
      big.textContent = (i.battery && i.battery.level != null ? i.battery.level : "--") + "%"
        + (i.battery && i.battery.charging ? " ↯" : "");
      /* The tile is a third of the panel wide — short units only, or it ellipsises. */
      sub.textContent = [
        fmt.bytes(i.storage && i.storage.free),
        fmt.durationShort(i.uptimeMs || 0) + " up",
        (i.network && i.network.type) || "offline"
      ].join(" · ");
    },

    onOpen: function (panel) { this.panel = panel; this.paintPanel(); },
    onClose: function () { this.panel = null; },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("system");
      /* refreshes every 5 s — skip while a finger is down, keep the scroll position */
      if (!panel || !WP.panels.isOpen("system") || WP.touching()) return;
      var body = WP.qs("[data-body]", panel);
      var i = this.info;

      if (!i) {
        WP.qs("[data-sub]", panel).textContent = "bridge unavailable";
        body.innerHTML = '<div class="muted">The Android JS bridge is not attached, so no '
          + "real device data is available. Everything else on this dashboard still works — "
          + "rebuild and reinstall the APK to restore it.</div>";
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
        '<div class="big-readout"><div class="big-icon">' + (b.charging ? "↯" : "▭") + "</div>"
        + '<div class="big-time">' + (b.level != null ? b.level : "--") + "%</div>"
        + '<div class="big-sub">' + esc(b.status || "") + (b.plugged ? " · " + esc(b.plugged) : "")
        + "</div></div>"
        + bar(b.level || 0, b.charging ? "accent" : (b.level < 20 ? "danger" : ""))

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
          ]))

        + section("Storage", bar(stPct) + statGrid([
            ["Free", fmt.bytes(st.free)],
            ["Used", fmt.bytes(stUsed)],
            ["Total", fmt.bytes(st.total)],
            ["Used %", stPct.toFixed(1) + "%"]
          ]))

        + section("Memory", bar(memPct) + statGrid([
            ["Free", fmt.bytes(mem.free)],
            ["Total", fmt.bytes(mem.total)],
            ["Low memory", mem.low ? "Yes" : "No"],
            ["Used %", memPct.toFixed(1) + "%"]
          ]))

        + section("Network", statGrid([
            ["Transport", esc(net.type || "none")],
            ["Internet", net.validated ? "Validated" : "Not validated"],
            ["Metered", net.metered ? "Yes" : "No"],
            ["Interface", esc(net.iface || "--")],
            ["Down", net.downKbps ? Math.round(net.downKbps / 1000) + " Mbps" : "--"],
            ["Up", net.upKbps ? Math.round(net.upKbps / 1000) + " Mbps" : "--"]
          ]))

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
          ])));
    }
  };

  /* =========================================================================
     8. SETTINGS — real, persisted, applied immediately
     ========================================================================= */
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
          case "units":  S.set("units", arg); break;
          case "hours":  S.set("clockHours", parseInt(arg, 10)); break;
          case "secs":   S.set("seconds", arg === "1"); break;
          case "burn":   S.set("burnIn", arg === "1"); break;
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
      WP.qs("[data-sub]", panel).textContent = "saved to localStorage — survives a force-stop";

      var show = S.get("show");
      var rows = WP.WIDGETS.map(function (w) {
        return '<button class="srow tappable" data-ns="settings" data-act="widget" data-arg="'
          + w + '"><span class="srow-k">' + esc(WP.WIDGET_LABELS[w]) + "</span>"
          + '<span class="switch' + (show[w] ? " on" : "") + '"><span></span></span></button>';
      }).join("");

      WP.repaint(body,
        section("Units", segmented("settings", "units",
            [["fahrenheit", "°F  mph  inHg"], ["celsius", "°C  km/h  hPa"]], S.get("units")))

        + section("Clock", segmented("settings", "hours",
            [[12, "12-hour"], [24, "24-hour"]], S.get("clockHours"))
          + '<div class="gap"></div>'
          + segmented("settings", "secs",
            [[0, "Hide seconds"], [1, "Show seconds"]], S.get("seconds") ? 1 : 0))

        + section("Burn-in protection", segmented("settings", "burn",
            [[1, "Drift on"], [0, "Drift off"]], S.get("burnIn") ? 1 : 0)
          + '<div class="muted">AMOLED panel: every layer &mdash; dashboard, detail panels '
          + "and the alarm overlay &mdash; nudges up to "
          + ((C.burnInProtection || {}).maxShiftPx || 12) + "px every "
          + ((C.burnInProtection || {}).intervalSeconds || 120)
          + "s, including while a panel is open. A nudge is skipped while a finger is down. "
          + "An open panel also returns to the dashboard after 90s with no touch.</div>")

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
                ? '<div class="muted">This wipes units, clock format, burn-in and every '
                  + "widget's visibility. Tap anything else to cancel.</div>"
                : "")
            + '<div class="muted">Bridge: ' + (WP.bridge.present() ? "attached" : "not attached")
            + " · Home Assistant: " + sensors.mode
            + " · Viewport: " + window.innerWidth + "×" + window.innerHeight
            + " @" + window.devicePixelRatio + "x</div>"));
    }
  };

  /* ---------------- register everything ---------------- */
  WP.register(clock);
  WP.register(timer);
  WP.register(weather);
  WP.register(hourly);
  WP.register(daily);
  WP.register(sensors);
  WP.register(system);
  WP.register(settingsPlugin);
})();
