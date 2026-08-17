/* Wall panel dashboard — CORE.
   Standalone: no server, no Raspberry Pi, no framework, no CDN.

   Same plugin idea the panel started with (each card is a small module with an init()
   and its own refresh cadence, mirroring InkyPi) — this file just grows the shared
   plumbing those modules now need:

     WP.settings   persisted user prefs (localStorage, mirrored into SharedPreferences)
     WP.panels     the full-screen detail-panel stack
     WP.bridge     safe wrapper around the Android @JavascriptInterface object
     WP.register   plugin registry; widgets.js registers into it
     WP.wmo/fmt    formatting helpers shared by the weather widgets

   Widgets themselves live in widgets.js so neither file becomes a wall of code. */

window.WP = (function () {
  "use strict";

  var C = window.CONFIG || {};

  /* ---------------- tiny DOM helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function pad2(n) { return ("0" + Math.floor(n)).slice(-2); }
  /* Everything that reaches innerHTML goes through this. The only untrusted strings we
     handle are Home Assistant entity names, but escaping is cheap insurance. */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function setStatus(msg, warn) {
    var el = $("status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (warn ? " warn" : "");
  }

  /* Transient confirmation, for actions whose only other feedback would be a number
     quietly changing (HA toggles, settings resets).

     Every screen here is a full layout with no spare band, so a floating toast is always
     over *something*; the only real choice is what. Two earlier positions both picked
     content: 5.5vh printed through the panel subtitle, 11.5vh cleared the header and
     landed on the first content row instead — in the HA panel, on the entity chip row the
     user had just tapped. So the toast now takes over the one line of throwaway text in
     whichever context it appears (the home status line, or an open panel's subtitle) and
     that line fades out underneath it: no control and no data is ever covered. The
     `toasting` class on <body> is what drives the fade — see style.css. */
  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    document.body.classList.add("toasting");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
      document.body.classList.remove("toasting");
    }, 1800);
  }

  /* ---------------- Android bridge ----------------
     MainActivity injects `Android`. Every call is guarded so the page still runs in a
     plain browser (or on an older build of the APK) with the bridge simply absent. */
  var bridge = {
    present: function () {
      return typeof window.Android !== "undefined" && window.Android !== null;
    },
    has: function (fn) {
      return bridge.present() && typeof window.Android[fn] === "function";
    },
    call: function (fn, arg) {
      if (!bridge.has(fn)) return null;
      try {
        return (arg === undefined) ? window.Android[fn]() : window.Android[fn](arg);
      } catch (e) {
        console.warn("bridge " + fn + " failed: " + e.message);
        return null;
      }
    },
    /* Convenience: bridge methods return JSON strings so one call can carry a whole
       snapshot instead of a dozen round-trips across the JS/Java boundary. */
    json: function (fn, arg) {
      var raw = bridge.call(fn, arg);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
  };

  /* ---------------- persisted settings ----------------
     localStorage is the source of truth (spec), but a wall panel gets force-stopped and
     wiped more than a phone browser does, so every write is also mirrored into Android
     SharedPreferences and used as a fallback if localStorage comes back empty. */
  var WIDGETS = ["clock", "weather", "hourly", "daily", "sensors", "system", "timer", "settings"];
  var WIDGET_LABELS = {
    clock: "Clock", weather: "Weather now", hourly: "Hourly forecast",
    daily: "Daily forecast", sensors: "Home Assistant", system: "Device",
    timer: "Stopwatch & timer", settings: "Settings tile"
  };

  var store = {
    read: function (key) {
      var v = null;
      try { v = window.localStorage.getItem(key); } catch (e) { /* file:// quirk */ }
      if (v == null) v = bridge.call("getPref", key);
      return v || null;
    },
    write: function (key, val) {
      try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ }
      if (bridge.has("setPref")) {
        try { window.Android.setPref(key, val); } catch (e) { /* ignore */ }
      }
    },
    readJSON: function (key, fallback) {
      var raw = store.read(key);
      if (!raw) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    writeJSON: function (key, obj) { store.write(key, JSON.stringify(obj)); }
  };

  var SETTINGS_KEY = "inky.settings.v2";
  var listeners = [];

  function defaults() {
    var b = C.burnInProtection || {};
    var s = {
      units:      (C.units === "celsius") ? "celsius" : "fahrenheit",
      clockHours: (C.clockHours === 24) ? 24 : 12,
      seconds:    false,
      burnIn:     b.enabled !== false,
      show:       {}
    };
    /* Every widget ships visible. CONFIG.plugins is the old on/off list and is honoured
       only as a starting hint — the Settings panel is now the real control, and it
       persists, so we must not let a stale config file hide half the dashboard. */
    WIDGETS.forEach(function (w) { s.show[w] = true; });
    return s;
  }

  var settings = {
    data: defaults(),

    load: function () {
      var saved = store.readJSON(SETTINGS_KEY, null);
      if (saved && typeof saved === "object") {
        var d = defaults();
        if (saved.units === "celsius" || saved.units === "fahrenheit") d.units = saved.units;
        if (saved.clockHours === 12 || saved.clockHours === 24) d.clockHours = saved.clockHours;
        d.seconds = !!saved.seconds;
        d.burnIn = saved.burnIn !== false;
        if (saved.show) {
          WIDGETS.forEach(function (w) {
            if (typeof saved.show[w] === "boolean") d.show[w] = saved.show[w];
          });
        }
        settings.data = d;
      }
      return settings.data;
    },

    get: function (k) { return settings.data[k]; },

    /* One setter for everything so persistence + "apply immediately" can never drift
       apart: write, save, then tell every plugin that cares. */
    set: function (k, v) {
      settings.data[k] = v;
      store.writeJSON(SETTINGS_KEY, settings.data);
      applyVisibility();
      listeners.forEach(function (fn) {
        try { fn(k, v); } catch (e) { console.error("settings listener: " + e.message); }
      });
    },

    setShow: function (widget, on) {
      settings.data.show[widget] = !!on;
      settings.set("show", settings.data.show);
    },

    reset: function () {
      settings.data = defaults();
      store.writeJSON(SETTINGS_KEY, settings.data);
      applyVisibility();
      listeners.forEach(function (fn) { try { fn("*", null); } catch (e) {} });
    },

    onChange: function (fn) { listeners.push(fn); },

    /* Temperature unit suffix used all over the weather widgets. */
    tempUnit: function () { return settings.data.units === "celsius" ? "C" : "F"; },
    isMetric: function () { return settings.data.units === "celsius"; }
  };

  /* Show/hide home cards to match settings.show. Cards keep their DOM and their refresh
     loops — hiding is purely visual, so re-enabling one is instant.
     If the user hides everything the home view would be a black rectangle, which on a wall
     panel is indistinguishable from a crashed app — so an empty state takes over and points
     back at Settings. */
  function applyVisibility() {
    var visible = 0;
    qsa("[data-widget]").forEach(function (node) {
      var w = node.getAttribute("data-widget");
      if (!w || !(w in settings.data.show)) return;
      var on = settings.data.show[w];
      node.style.display = on ? "" : "none";
      if (on) visible++;
    });
    /* A wrapper whose every widget is hidden has to go too. `.row3` is not itself a
       [data-widget] — it is the flex row that holds the Device / Timer / Settings tiles —
       so with all three switched off it stayed in the column as an empty row that still
       carried flex-grow:1, and swallowed every pixel the hidden cards gave back. That, not
       the `margin: auto 0`, is why the all-hidden empty state rendered bottom-anchored with
       ~1700 device px of black above it. */
    qsa("#home > .row3").forEach(function (row) {
      var any = qsa("[data-widget]", row).some(function (n) {
        return n.style.display !== "none";
      });
      row.style.display = any ? "" : "none";
    });
    var empty = $("empty");
    if (empty) empty.hidden = (visible > 0);
    relayoutHome();
  }

  /* ---------------- home column layout ----------------
     Both numbers below need the cards at their *intrinsic* height, and flex-grow hides
     that, so one pass neutralises grow, measures, and puts it back:

       slack     headroom left below the last card. Logged at boot; a downward burn-in
                 nudge eats into it, and overflow has to stay 0 or the bottom tile row is
                 being clipped off a wall panel nobody is standing in front of.
       grow cap  how far a surviving card may stretch when a widget is switched off.

     Uncapped flex-grow handed the hidden widgets' whole height to whatever was left: at
     three hidden the Weather card came out ~800 device px tall with ~250 px of dead black
     above its content and ~250 below, and the HOME card ~900. At 2-4 m that does not read
     as breathing room, it reads as a card that failed to load. Each card may now grow to
     at most GROW_CAP x its own intrinsic height; because every card is capped, the
     remainder is left over once, as a single margin below the last card (#home is
     flex-start). One or two hidden still fills the column exactly as before — the cap only
     binds when there is more space to hand out than the cards can plausibly use.

     The cap is recomputed whenever visibility changes, whenever the weather payload
     changes a card's size, and on a slow heartbeat — a cap measured while the cards were
     still empty would otherwise clip them once the data landed. */
  var GROW_CAP = 1.3;

  function homeMetrics() {
    var hv = $("home");
    if (!hv) return null;
    var kids = qsa("#home > *").filter(function (n) {
      return n.id !== "empty" && n.offsetHeight > 0;
    });
    if (!kids.length) return null;
    kids.forEach(function (n) { n.style.maxHeight = "none"; n.style.flexGrow = "0"; });
    var nat = kids.map(function (n) { return n.offsetHeight; });
    var slack = Math.round(hv.clientHeight
      - (kids[kids.length - 1].getBoundingClientRect().bottom
         - hv.getBoundingClientRect().top));
    kids.forEach(function (n) { n.style.flexGrow = ""; });
    /* Both axes. The vertical one was measured from the first round because the column is
       a height budget; the horizontal one went unchecked for five, and in 24-hour mode the
       hourly strip was clipping an eighth chip through the middle of a glyph at the card's
       right edge — "20:00" rendered as a sheared "2". Anything that leaves the frame
       sideways is as broken as anything that leaves it downwards, and #home never scrolls
       horizontally (the strip has its own scroller), so this must be 0. */
    return { el: hv, kids: kids, nat: nat, slack: slack,
             overflow: hv.scrollHeight - hv.clientHeight,
             overflowX: hv.scrollWidth - hv.clientWidth };
  }

  /* Until the cards have their content, their intrinsic height is not their real one, and a
     cap measured against an empty card would clip it the moment the payload landed. So no
     cap is applied before the first widget signals that it has filled in (weather.publish),
     which is also the first moment the measurement means anything. */
  var layoutReady = false;

  function relayoutHome() {
    if (touching) return;                       // never reflow the column under a finger
    var m = homeMetrics();
    if (!m) return;
    if (!layoutReady) {
      m.kids.forEach(function (n) { n.style.maxHeight = ""; });
      return;
    }
    /* Nothing to hand out (all eight widgets on: ~34 device px) means the cap can only be
       a liability, so drop it and let flex-grow do what it already did correctly. */
    if (m.slack <= 0) {
      m.kids.forEach(function (n) { n.style.maxHeight = ""; });
      return;
    }
    m.kids.forEach(function (n, i) {
      n.style.maxHeight = Math.round(m.nat[i] * GROW_CAP) + "px";
    });
  }

  /* ---------------- panel stack ----------------
     Panels are full-screen and pre-authored in index.html; opening one calls the owning
     plugin's onOpen(panel, arg) to fill its body. A stack (rather than a single "open"
     flag) means a panel can push another panel and still return to the right place.

     Idle unwind: see armIdle below — panels are one of the layers that register there. */
  var unmountTimers = {};

  var panels = {
    stack: [],

    el: function (name) { return qs('[data-panel="' + name + '"]'); },

    open: function (name, arg) {
      var el = panels.el(name);
      if (!el) return;
      if (panels.stack.indexOf(name) === -1) panels.stack.push(name);
      /* A close under 240ms ago left an unmount timer running for this same panel; letting
         it fire now would strip is-mounted — and with it visibility — off a panel we are in
         the middle of opening. */
      clearTimeout(unmountTimers[name]);

      /* Panels are pre-authored and reused, so the body still carries the scroll offset it
         had when it was last closed. Reopening Settings scrolled to MAINTENANCE put the
         WIDGETS rows exactly where the reader expected UNITS / CLOCK, and cost a mis-tap
         that silently hid a widget. Reset before onOpen, never after: hourly deliberately
         scrolls its own selected row into view from inside onOpen. */
      var body = qs("[data-body]", el);
      if (body) body.scrollTop = 0;

      var p = registry[name];
      if (p && p.onOpen) {
        try { p.onOpen(el, arg); } catch (e) { console.error(name + " onOpen: " + e.message); }
      }
      /* Force a reflow between "displayed" and "animated" so the 200ms fade/slide
         actually runs instead of being collapsed into the same frame. */
      el.classList.add("is-mounted");
      void el.offsetWidth;
      el.classList.add("is-open");
      document.body.classList.add("panel-open");
      armIdle();
    },

    close: function () {
      var name = panels.stack.pop();
      if (!name) return;
      var el = panels.el(name);
      if (el) {
        /* is-open carries pointer-events (see style.css), so touch is handed back to the
           dashboard on this line rather than 240ms later when the fade finishes. While it
           was tied to is-mounted, the invisible fading panel ate any tap inside that
           window — tap "← Dashboard" then immediately tap a card and nothing happened.
           The one thing that must *not* become live again is whatever was hiding under the
           close button itself; that is handled by the close shadow in runHit, not here. */
        el.classList.remove("is-open");
        unmountTimers[name] = setTimeout(function () {
          el.classList.remove("is-mounted");
        }, 240);
      }
      var p = registry[name];
      if (p && p.onClose) {
        try { p.onClose(el); } catch (e) { console.error(name + " onClose: " + e.message); }
      }
      /* Anything still on the stack becomes the visible panel again. */
      if (!panels.stack.length) document.body.classList.remove("panel-open");
      armIdle();
    },

    closeAll: function () { while (panels.stack.length) panels.close(); },

    isOpen: function (name) { return panels.stack.indexOf(name) !== -1; },
    top: function () { return panels.stack[panels.stack.length - 1] || null; }
  };

  /* ---------------- idle unwind ----------------
     A wall panel is walked away from, not closed. Anything parked on top of the dashboard
     therefore has to take itself back down, or the panel stops being a dashboard — that is
     what the 90s panel timeout was added for. A finished countdown then proved the point
     from the other side: the full-screen alarm overlay lived *outside* the panel stack, so
     nothing unwound it. One laundry timer and the wall showed a pulsing red "Timer
     finished" indefinitely, swallowing every tap aimed at the tiles underneath.

     So the timeout is no longer a panel feature. Every layer that can cover the dashboard
     registers here with its own patience, and one timer takes down whatever has sat there
     too long. Any pointerdown restarts every open layer's countdown, so a panel being read
     is never yanked away, and a layer that is genuinely unattended always goes. */
  var PANEL_IDLE_MS = 90000;
  var idleTimer = null;
  var idleLayers = [];

  function registerIdleLayer(layer) {
    layer.since = Date.now();
    idleLayers.push(layer);
    return layer;
  }

  function openIdleLayers() {
    return idleLayers.filter(function (l) {
      try { return !!l.isOpen(); } catch (e) { return false; }
    });
  }

  /* Somebody is here: every open layer's patience starts over. */
  function armIdle() {
    var now = Date.now();
    openIdleLayers().forEach(function (l) { l.since = now; });
    scheduleIdle();
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    var open = openIdleLayers();
    if (!open.length) return;
    var wait = Math.min.apply(null, open.map(function (l) {
      return l.since + l.ms - Date.now();
    }));
    idleTimer = setTimeout(runIdle, Math.max(200, wait));
  }

  function runIdle() {
    if (touching) { armIdle(); return; }        // a finger is down: not idle
    var now = Date.now();
    var due = openIdleLayers().filter(function (l) { return now - l.since >= l.ms - 100; });
    var msg = null;
    due.forEach(function (l) {
      try { l.close(); } catch (e) { console.error("idle close " + l.name + ": " + e.message); }
      if (l.toast && !msg) msg = l.toast;
    });
    if (msg) toast(msg);
    scheduleIdle();
  }

  registerIdleLayer({
    name: "panels",
    ms: PANEL_IDLE_MS,
    isOpen: function () { return panels.stack.length > 0; },
    close: function () { panels.closeAll(); },
    toast: "Idle — back to dashboard"
  });

  /* MainActivity's onBackPressed calls this instead of leaving the app: back closes the
     top panel and nothing else. Returns true if it consumed the press. */
  function onAndroidBack() {
    if (panels.stack.length) { panels.close(); return true; }
    return false;
  }

  /* ---------------- touch wiring ----------------
     One delegated listener for the whole app. `data-open` opens a panel (optionally with
     `data-arg`), `data-close` pops one, `data-act` is handed to the plugin that owns the
     panel it was tapped inside. */
  var actionHandlers = {};
  function onAction(ns, fn) { actionHandlers[ns] = fn; }

  /* True between pointerdown and pointerup. Widgets that repaint on a timer check it and
     skip that frame: replacing a button's DOM node between press and release makes the
     browser dispatch the click on the surviving ancestor instead, silently eating the tap. */
  var touching = false;
  function isTouching() { return touching; }

  /* innerHTML swap that keeps the container's scroll position — a detail panel that
     refreshes every few seconds must not yank the user back to the top mid-read. */
  function repaint(el, html) {
    if (!el) return;
    var top = el.scrollTop;
    el.innerHTML = html;
    if (top) el.scrollTop = top;
  }

  /* The element a tap on `node` would act on, and what that action is. Order matters and
     matches the historical click handler: close beats act beats open. */
  function hit(node) {
    if (!node || !node.closest) return null;
    var el = node.closest("[data-close]");
    if (el) return { el: el, kind: "close" };
    el = node.closest("[data-act]");
    if (el) return { el: el, kind: "act" };
    el = node.closest("[data-open]");
    if (el) return { el: el, kind: "open" };
    return null;
  }

  /* ---- close shadow ----
     Both close affordances sit directly on top of something tappable: the full-width footer
     bar covers the DEVICE / TIMER / SETTINGS tile row, and the header ✕ covers the topbar
     gear. Since pointer-events is released the instant a panel closes (so a tap ~80ms later
     still reaches a card — see panels.close), the *second* tap of a human double-tap on
     either affordance landed on whatever was underneath and re-opened a panel. The ✕ variant
     silently opened Settings, which is where widgets can be hidden.

     A post-close cooldown is the wrong instrument: it would put back exactly the dead window
     that releasing pointer-events removed. What is actually wrong is narrower — one specific
     rectangle became live under the finger without the finger moving — so the suppression is
     that narrow too. A close tap leaves a short-lived "shadow" at the point it landed, and
     only a data-open element whose *current* rect still contains that point is refused.
     Anything else — a different tile, a different card, the same tile after the window —
     opens normally, so close-then-tap-elsewhere keeps working at any gap.

     Reading the live rect (rather than comparing raw tap coordinates) is deliberate: burn-in
     drift can have moved the layer by up to 12 CSS px between the two taps, and the question
     being asked is "is this the thing that was hiding under the close button", which is a
     question about where that element is now. */
  var CLOSE_SHADOW_MS = 600;          // covers the human double-tap range with margin
  var closeShadow = null;

  function shadowed(el) {
    if (!closeShadow || Date.now() > closeShadow.until) { closeShadow = null; return false; }
    var r = el.getBoundingClientRect();
    return closeShadow.x >= r.left && closeShadow.x <= r.right
        && closeShadow.y >= r.top  && closeShadow.y <= r.bottom;
  }

  function runHit(h, pt) {
    if (!h) return false;
    if (h.kind === "close") {
      closeShadow = pt ? { x: pt.x, y: pt.y, until: Date.now() + CLOSE_SHADOW_MS } : null;
      panels.close();
      return true;
    }
    if (h.kind === "act") {
      var ns = h.el.getAttribute("data-ns") || panels.top();
      var fn = actionHandlers[ns];
      if (fn) {
        try { fn(h.el.getAttribute("data-act"), h.el.getAttribute("data-arg"), h.el); }
        catch (e) { console.error("action " + ns + ": " + e.message); }
      }
      return true;
    }
    /* Still "true": the gesture was consumed, so the click Chrome sends afterwards is eaten
       rather than re-running the same suppressed open a frame later. */
    if (shadowed(h.el)) return true;
    panels.open(h.el.getAttribute("data-open"), h.el.getAttribute("data-arg"));
    return true;
  }

  /* ---- press bookkeeping ----
     Activation is driven off the *pointer*, not off `click`. A deliberate 600 ms press —
     which is how people use a panel on a wall — makes Chrome treat the gesture as a
     long-press and swallow the click entirely, so the card lit up under the finger and
     then did nothing on release. Pointer events still arrive in that case (as pointerup,
     or as pointercancel once the gesture is claimed), so both are honoured.

     Two different slops, because the two endings mean different things:
       pointerup   — the gesture was never claimed by a scroller, so a generous 14 CSS px
                     just tolerates finger wobble on release.
       pointercancel — either a long-press gesture (no movement) or a scroll taking over
                     (movement past Chrome's own ~8 px touch slop). A tight 6 px keeps
                     scrolling the hourly strip or a panel body from firing a tap. */
  var UP_SLOP = 14, CANCEL_SLOP = 6;
  var press = null;
  var eatClickUntil = 0;

  function endPress(ev, slop) {
    touching = false;
    qsa(".is-press").forEach(function (n) { n.classList.remove("is-press"); });
    var p = press;
    press = null;
    if (!p || (ev.pointerId != null && ev.pointerId !== p.id)) return;
    if (p.moved > slop || !p.hit) return;
    /* Release must still be over the element the press started on. */
    var over = hit(ev.target);
    if (ev.type === "pointerup" && (!over || over.el !== p.hit.el)) return;
    /* The press-start point, not the release point: it is where the finger actually landed,
       and it cannot have drifted by up to UP_SLOP the way clientX/Y on release can. */
    if (runHit(p.hit, { x: p.x, y: p.y })) {
      /* Chrome will still deliver its own click for a normal short tap; ignore it so the
         action does not run twice. Long-presses never get here. */
      eatClickUntil = Date.now() + 700;
    }
  }

  function bindTouch() {
    document.addEventListener("click", function (ev) {
      /* Fallback path only: mouse, hardware keyboard, or any environment without pointer
         events. A click that follows an activation we already performed is dropped. */
      if (Date.now() < eatClickUntil) { eatClickUntil = 0; return; }
      runHit(hit(ev.target), { x: ev.clientX, y: ev.clientY });
    }, false);

    /* CSS :active is unreliable inside a scroll container in WebView, so press feedback
       is driven explicitly. Every tappable element gets it, including ones built later. */
    document.addEventListener("pointerdown", function (ev) {
      touching = true;
      armIdle();                                   // reading a panel keeps it open
      press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: 0, hit: hit(ev.target) };
      var t = ev.target.closest ? ev.target.closest(".tappable") : null;
      if (t) t.classList.add("is-press");
    }, true);

    document.addEventListener("pointermove", function (ev) {
      if (!press || ev.pointerId !== press.id) return;
      var d = Math.max(Math.abs(ev.clientX - press.x), Math.abs(ev.clientY - press.y));
      if (d > press.moved) press.moved = d;
    }, true);

    /* Chrome can claim a scroll gesture without ever delivering a pointermove, which would
       leave `moved` at 0 and make the pointercancel look like a long-press. touchmove is
       still delivered to passive listeners while scrolling, and a scroll event is proof on
       its own, so both feed the same counter. */
    document.addEventListener("touchmove", function (ev) {
      if (!press || !ev.touches || !ev.touches.length) return;
      var t = ev.touches[0];
      var d = Math.max(Math.abs(t.clientX - press.x), Math.abs(t.clientY - press.y));
      if (d > press.moved) press.moved = d;
    }, { passive: true, capture: true });
    document.addEventListener("scroll", function () {
      if (press) press.moved = 9999;
    }, true);

    document.addEventListener("pointerup", function (ev) { endPress(ev, UP_SLOP); }, true);
    document.addEventListener("pointercancel", function (ev) { endPress(ev, CANCEL_SLOP); }, true);
    /* pointerleave carries no gesture meaning here — just make sure nothing stays lit. */
    document.addEventListener("pointerleave", function () {
      touching = false;
      qsa(".is-press").forEach(function (n) { n.classList.remove("is-press"); });
    }, true);
  }

  /* ---------------- burn-in drift ----------------
     This panel is AMOLED: a dashboard that never moves ghosts permanently, and on a wall
     panel "never moves" is the normal case — nobody is watching it at 3am.

     Every layer that can be on screen for hours drifts together on the same slow cycle:
     the home wrapper, the full-screen panel layer, and the countdown alarm overlay. The
     panel layer used to be excluded *and* drift was paused outright while a panel was
     open, so a detail panel left up overnight was ~8 hours of perfectly static pixels
     with protection silently disabled. Moving every layer by the identical offset keeps
     them registered with each other, so there is no visible seam.

     The reason drift used to pause — never move a control out from under a finger — is
     handled instead by skipping any nudge while a pointer is down. The shift is at most
     12 CSS px eased over 4 s, against touch targets of 88+ device px. */
  var DRIFT_LAYERS = ["drift", "panels", "alarm"];

  var drift = {
    timer: null,
    paused: false,

    start: function () {
      drift.stop();
      if (!settings.get("burnIn")) { drift.reset(); return; }
      var b = C.burnInProtection || {};
      var every = (b.intervalSeconds || 120) * 1000;
      drift.nudge();
      drift.timer = setInterval(drift.nudge, every);
    },

    stop: function () { if (drift.timer) { clearInterval(drift.timer); drift.timer = null; } },

    apply: function (css) {
      DRIFT_LAYERS.forEach(function (id) {
        var el = $(id);
        if (el) el.style.transform = css;
      });
    },

    nudge: function () {
      /* A finger is down: skip this cycle rather than sliding the target. The next one is
         120 s away, which is nothing against the hours that cause ghosting. */
      if (drift.paused || touching || !settings.get("burnIn")) return;
      var b = C.burnInProtection || {};
      var max = b.maxShiftPx || 12;
      var x = (Math.random() * 2 - 1) * max;
      var y = (Math.random() * 2 - 1) * max;
      drift.apply("translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)");
    },

    reset: function () { drift.apply("translate(0,0)"); },

    /* Kept for callers that genuinely need stillness (nothing does today — opening a panel
       no longer pauses drift, which was the bug). */
    pause: function () { drift.paused = true; },
    resume: function () { drift.paused = false; }
  };

  /* ---------------- WMO weather codes -> icon + words ----------------
     Open-Meteo returns WMO codes; map them to something readable at 2-4 m. `night`
     swaps the handful of icons where day/night actually looks different.

     Every glyph here is a *text-presentation* symbol (U+2600 block) so Android renders
     them from the monochrome symbol font. Two codepoints in this table default to EMOJI
     presentation and landed as full-colour sprites among otherwise white glyphs --
     U+26C5 (sun behind cloud) and U+26C8 (thunder cloud) -- so both carry U+FE0E, the
     text-presentation selector. The rest (U+2600 sun, U+2601 cloud, U+2602 umbrella,
     U+263D moon, U+2744 snowflake) are text-default already. */
  var PARTLY = "⛅︎";
  var STORM  = "⛈︎";
  var WMO = {
    0:  ["☀", "☽", "Clear"],
    1:  ["☀", "☽", "Mostly clear"],
    2:  [PARTLY, "☁", "Partly cloudy"],
    3:  ["☁", "☁", "Overcast"],
    45: ["☁", "☁", "Fog"],
    48: ["☁", "☁", "Rime fog"],
    51: ["☂", "☂", "Light drizzle"],
    53: ["☂", "☂", "Drizzle"],
    55: ["☂", "☂", "Heavy drizzle"],
    56: ["❄", "❄", "Freezing drizzle"],
    57: ["❄", "❄", "Freezing drizzle"],
    61: ["☂", "☂", "Light rain"],
    63: ["☂", "☂", "Rain"],
    65: ["☂", "☂", "Heavy rain"],
    66: ["❄", "❄", "Freezing rain"],
    67: ["❄", "❄", "Freezing rain"],
    71: ["❄", "❄", "Light snow"],
    73: ["❄", "❄", "Snow"],
    75: ["❄", "❄", "Heavy snow"],
    77: ["❄", "❄", "Snow grains"],
    80: ["☂", "☂", "Showers"],
    81: ["☂", "☂", "Showers"],
    82: [STORM, STORM, "Heavy showers"],
    85: ["❄", "❄", "Snow showers"],
    86: ["❄", "❄", "Snow showers"],
    95: [STORM, STORM, "Thunderstorm"],
    96: [STORM, STORM, "Thunderstorm"],
    99: [STORM, STORM, "Thunderstorm"]
  };
  function wmo(code, night) {
    var e = WMO[code] || ["·", "·", "Unknown"];
    return { icon: night ? e[1] : e[0], text: e[2] };
  }

  /* ---------------- shared formatting ---------------- */
  var fmt = {
    deg: function (n) { return (n == null || isNaN(n)) ? "--°" : Math.round(n) + "°"; },
    deg1: function (n) { return (n == null || isNaN(n)) ? "--" : (Math.round(n * 10) / 10) + "°"; },

    /* Open-Meteo is asked for mph/inch or km/h/mm to match the unit setting, so speed and
       precipitation just need a label. Pressure always arrives in hPa. */
    speedUnit: function () { return settings.isMetric() ? "km/h" : "mph"; },
    precipUnit: function () { return settings.isMetric() ? "mm" : "in"; },
    pressure: function (hPa) {
      if (hPa == null) return "--";
      return settings.isMetric()
        ? Math.round(hPa) + " hPa"
        : (Math.round(hPa * 0.02953 * 100) / 100) + " inHg";
    },
    distance: function (metres) {
      if (metres == null) return "--";
      return settings.isMetric()
        ? (Math.round(metres / 100) / 10) + " km"
        : (Math.round(metres / 160.934) / 10) + " mi";
    },
    compass: function (deg) {
      if (deg == null) return "--";
      var pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                 "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
      return pts[Math.round(deg / 22.5) % 16];
    },
    /* UV bands are the WHO ones; the label is what actually matters at a glance. */
    uv: function (v) {
      if (v == null) return { n: "--", label: "" };
      var n = Math.round(v * 10) / 10;
      var label = v < 3 ? "Low" : v < 6 ? "Moderate" : v < 8 ? "High"
                : v < 11 ? "Very high" : "Extreme";
      return { n: n, label: label };
    },
    clock: function (d, withSeconds) {
      var h = d.getHours(), m = d.getMinutes(), suffix = "";
      if (settings.get("clockHours") === 12) {
        suffix = h >= 12 ? " PM" : " AM";
        h = h % 12; if (h === 0) h = 12;
      } else {
        h = pad2(h);
      }
      return h + ":" + pad2(m) + (withSeconds ? ":" + pad2(d.getSeconds()) : "") + suffix;
    },
    hourLabel: function (d) {
      if (settings.get("clockHours") === 24) return pad2(d.getHours()) + ":00";
      var h = d.getHours() % 12; if (h === 0) h = 12;
      return h + (d.getHours() >= 12 ? "p" : "a");
    },
    bytes: function (b) {
      if (b == null || isNaN(b)) return "--";
      var u = ["B", "KB", "MB", "GB", "TB"], i = 0, n = Number(b);
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + " " + u[i];
    },
    duration: function (ms) {
      var s = Math.floor(ms / 1000);
      var d = Math.floor(s / 86400); s -= d * 86400;
      var h = Math.floor(s / 3600);  s -= h * 3600;
      var m = Math.floor(s / 60);    s -= m * 60;
      if (d) return d + "d " + h + "h " + m + "m";
      if (h) return h + "h " + m + "m";
      return m + "m " + s + "s";
    },
    /* Single largest unit only — for the narrow tiles where the long form ellipsises. */
    durationShort: function (ms) {
      var s = Math.floor(ms / 1000);
      if (s >= 86400) return Math.floor(s / 86400) + "d";
      if (s >= 3600) return Math.floor(s / 3600) + "h";
      if (s >= 60) return Math.floor(s / 60) + "m";
      return s + "s";
    },
    /* mm:ss.t / h:mm:ss.t — elapsed time, truncated (a stopwatch reading 00:05 means five
       whole seconds have passed). */
    stopwatch: function (ms, tenths) {
      if (ms < 0) ms = 0;
      var t = Math.floor(ms / 100) % 10;
      var s = Math.floor(ms / 1000);
      var h = Math.floor(s / 3600); s -= h * 3600;
      var m = Math.floor(s / 60);   s -= m * 60;
      var core = (h ? h + ":" + pad2(m) : pad2(m)) + ":" + pad2(s);
      return tenths ? core + "." + t : core;
    },
    /* Time *remaining* rounds the other way. Truncating made a 1-minute countdown show
       60 -> 58 within a blink and then sit on 00:00 for a whole second before the alarm;
       ceiling gives the 01:00 -> 00:59 -> ... -> 00:01 -> alarm that a countdown owes you.
       The quantisation is done in ms so the shared formatter still does the layout. */
    countdown: function (ms) {
      return fmt.stopwatch(Math.ceil(Math.max(0, ms) / 1000) * 1000, false);
    },
    /* The exact ms the stopwatch display is showing. Lap splits are derived from this, not
       from raw elapsed times: truncating both columns independently let consecutive totals
       differ by 0.5 s while the split between them insisted it was 0.4 s. */
    swQuantise: function (ms) { return Math.floor(Math.max(0, ms) / 100) * 100; },
    ago: function (ms) {
      var s = Math.round((Date.now() - ms) / 1000);
      if (s < 60) return s + "s ago";
      if (s < 3600) return Math.round(s / 60) + "m ago";
      return Math.round(s / 3600) + "h ago";
    },

    /* Calendar arithmetic for the clock panel. It lives here, beside the other formatters,
       rather than inline in the panel's render closure, because it is exactly the kind of
       thing that goes quietly wrong: measuring from "now" to Jan 0 spans the spring-forward
       hour, so the difference came to 228 d 23 h and floored to 228 on day 229 — wrong every
       day between DST start and DST end. Comparing midnight to midnight and rounding is what
       makes it DST-safe, and being a named function is what makes it checkable. */
    dayOfYear: function (d) {
      var soy = new Date(d.getFullYear(), 0, 1);
      var today0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return Math.round((today0 - soy) / 86400000) + 1;
    },
    /* Only ever used to give dayOfYear a denominator — "161 of 365" is a fact, "161" on
       its own is a number nobody can place. Same calendar-not-clock arithmetic as above:
       counted in whole days, never in milliseconds, so a DST boundary cannot move it. */
    daysInYear: function (d) {
      var y = d.getFullYear();
      return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
    },
    /* ISO-8601 week: Thursday of this week decides which year's week 1 we are counting from. */
    isoWeek: function (d) {
      var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
      var week1 = new Date(t.getFullYear(), 0, 4);
      return 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    }
  };

  /* ---------------- sparkline ----------------
     A dependency-free SVG polyline. Used by the HA history view and the device panel;
     returns markup rather than a node so callers can drop it into a template string.
     opts.min / opts.max pin the vertical domain — on/off series want a fixed 0..1 scale
     so a switch that has not moved still reads as "held high", not as noise. */
  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.w || 100, h = opts.h || 30;
    var vals = (values || []).filter(function (v) { return typeof v === "number" && !isNaN(v); });
    if (vals.length < 2) return '<div class="spark-empty">collecting&hellip;</div>';

    var min = (opts.min != null) ? opts.min : Math.min.apply(null, vals);
    var max = (opts.max != null) ? opts.max : Math.max.apply(null, vals);
    /* A perfectly flat series has no range to scale against. Spread the domain around
       the value so the line lands mid-box instead of pinned to the bottom edge. */
    if (max - min < 1e-6) { var mid = min; min = mid - 1; max = mid + 1; }
    var pad = (opts.min != null && opts.max != null) ? 0 : (max - min) * 0.12;
    min -= pad; max += pad;

    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * w;
      var y = h - ((v - min) / (max - min)) * h;
      return (Math.round(x * 10) / 10) + "," + (Math.round(y * 10) / 10);
    });
    /* The filled area under the line is what makes it readable from across a room. */
    var area = "0," + h + " " + pts.join(" ") + " " + w + "," + h;
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">'
      + '<polygon class="spark-fill" points="' + area + '"></polygon>'
      + '<polyline class="spark-line" points="' + pts.join(" ") + '"></polyline>'
      + "</svg>";
  }

  /* ---------------- plugin registry ---------------- */
  var registry = {};
  function register(p) { registry[p.name] = p; }

  /* ---------------- boot ---------------- */
  function boot() {
    settings.load();
    applyVisibility();
    bindTouch();

    Object.keys(registry).forEach(function (name) {
      var p = registry[name];
      if (!p.init) return;
      try { p.init(); }
      catch (e) { console.error("plugin " + name + " init failed: " + e.message); }
    });

    drift.start();
    settings.onChange(function (k) { if (k === "burnIn" || k === "*") drift.start(); });

    console.log("[inky] booted; bridge=" + bridge.present()
      + " viewport=" + window.innerWidth + "x" + window.innerHeight
      + " dpr=" + window.devicePixelRatio);

    /* Regression guard for a whole class of bug rather than for one control. The alarm's
       Dismiss button stayed on a hand-rolled click listener while everything else moved to
       pointerup delegation, so it was the one control in the app that ignored a deliberate
       press-and-hold — exactly the gesture people use on a wall panel. Anything tappable
       that hit() cannot resolve is named here at boot; the expected count is 0. */
    var orphans = qsa("button, .tappable").filter(function (n) {
      return !n.closest("[data-open],[data-act],[data-close]");
    });
    if (orphans.length) {
      console.warn("[inky] " + orphans.length + " tappable(s) are not on the pointer "
        + "delegation and will ignore a long press: "
        + orphans.map(function (n) {
            return (n.id || n.className || n.tagName).toString().split(" ")[0];
          }).join(", "));
    }

    /* The home column is a fixed height budget and the only honest way to know it still
       fits is to measure it on the device, so one line of the log carries the numbers:
       overflow must stay 0 (anything else means a card grew and the bottom tile row is
       being clipped) and slack is the headroom a downward burn-in nudge eats into.
       Deferred until the weather payload has landed and the cards are at full size —
       measured at boot the cards are still empty and the number is meaningless.
       On device with all eight widgets on: overflow=0 slack=34, identical across all four
       12h/24h x seconds combinations. */
    setTimeout(function () {
      var m = homeMetrics();
      if (!m) return;
      console.log("[inky] layout: home overflow=" + m.overflow
        + " overflowX=" + m.overflowX
        + " slack=" + m.slack + "px cards=" + m.kids.length);
      layoutReady = true;
      relayoutHome();
    }, 12000);

    /* Every settings change can move the height budget — seconds on, a widget hidden — so
       the column is re-measured afterwards and the numbers go to logcat. The delay is for
       the 1 Hz clock tick and the card repaints to land first; measured immediately, the
       seconds field is still empty and the number is a lie. This is how "overflow=0 in all
       four 12h/24h x seconds combinations" gets checked without eyeballing a screenshot. */
    settings.onChange(function () {
      setTimeout(function () {
        var m = homeMetrics();
        if (!m) return;
        var line = "[inky] layout: home overflow=" + m.overflow
          + " overflowX=" + m.overflowX + " slack=" + m.slack
          + "px cards=" + m.kids.length;
        if (m.overflow > 0) console.warn(line + " — OVERFLOW, bottom row is clipped");
        else if (m.overflowX > 0) console.warn(line + " — OVERFLOW, content runs off the right");
        else console.log(line);
        relayoutHome();
      }, 1500);
    });

    /* Growth caps are measured off the current content, so they have to be re-measured
       when the content changes size. Visibility changes and the weather payload both call
       relayoutHome() directly; this heartbeat is the backstop for everything else (and for
       a cap that was measured while a card was still empty). Two forced layouts a minute
       against a panel that repaints its sensors every five seconds. */
    setInterval(relayoutHome, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    /* widgets.js registers during parse, so a late boot still sees every plugin. */
    setTimeout(boot, 0);
  }

  /* Anything a plugin (or MainActivity) needs is exported here. */
  return {
    C: C, $: $, qs: qs, qsa: qsa, esc: esc, pad2: pad2,
    status: setStatus, toast: toast,
    bridge: bridge, store: store,
    settings: settings, WIDGETS: WIDGETS, WIDGET_LABELS: WIDGET_LABELS,
    panels: panels, onAction: onAction, onAndroidBack: onAndroidBack,
    registerIdleLayer: registerIdleLayer, armIdle: armIdle,
    touching: isTouching, repaint: repaint,
    /* A widget calling this is telling us its content has landed, which is exactly the
       condition the growth cap needs before it may bind. */
    relayoutHome: function () { layoutReady = true; relayoutHome(); },
    drift: drift, wmo: wmo, fmt: fmt, sparkline: sparkline,
    register: register, registry: registry
  };
})();
