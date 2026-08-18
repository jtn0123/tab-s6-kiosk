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

  /* ---------------- bridge fetch ----------------
     Network through the Java shell (MainActivity.doFetch), because the page's file://
     origin is null and CORS therefore kills any request that matters: Home Assistant
     rejects the auth preflight and RSS feeds send no CORS headers at all.

     The shell only talks to origins registered HERE, once, at boot — first call wins in
     Java, so nothing that attaches to the page later (the devtools socket this userdebug
     ROM force-opens, an injected script) can widen the list. Widgets that need an origin
     push it onto WP.fetchOrigins while their file parses; boot() locks the list. */
  var fetchOrigins = [
    "https://api.open-meteo.com",
    "https://air-quality-api.open-meteo.com"
  ];

  /* "https://host[:port]/anything" -> "https://host[:port]" (lowercased), or null. */
  function originOf(url) {
    var m = /^(https?):\/\/([^\/?#]+)/i.exec(String(url || ""));
    if (!m) return null;
    var proto = m[1].toLowerCase(), hostport = m[2].toLowerCase();
    var dp = proto === "https" ? ":443" : ":80";
    if (hostport.slice(-dp.length) === dp) hostport = hostport.slice(0, -dp.length);
    return proto + "://" + hostport;
  }

  var bridgeFetch = {
    seq: 0,
    pending: {},
    TIMEOUT_MS: 20000,          // the shell gives up long before this; belt and braces

    available: function () { return bridge.has("httpFetch"); },

    lockOrigins: function () {
      if (!bridge.has("fetchOrigins")) return false;
      var uniq = [];
      fetchOrigins.forEach(function (o) {
        if (o && uniq.indexOf(o) === -1) uniq.push(o);
      });
      try { return window.Android.fetchOrigins(JSON.stringify(uniq)) === true; }
      catch (e) { return false; }
    },

    get: function (url, headers) { return bridgeFetch.send("GET", url, headers, null); },
    post: function (url, headers, body) { return bridgeFetch.send("POST", url, headers, body); },

    send: function (method, url, headers, body) {
      if (!bridgeFetch.available()) {
        return Promise.reject(new Error("bridge fetch unavailable"));
      }
      var id = "f" + (++bridgeFetch.seq);
      return new Promise(function (resolve, reject) {
        bridgeFetch.pending[id] = {
          res: resolve, rej: reject,
          t: setTimeout(function () { bridgeFetch._reject(id, "bridge fetch timed out"); },
                        bridgeFetch.TIMEOUT_MS)
        };
        try {
          window.Android.httpFetch(id, String(url),
            JSON.stringify(headers || {}), method, body == null ? null : String(body));
        } catch (e) {
          bridgeFetch._reject(id, "bridge call failed: " + (e && e.message));
        }
      });
    },

    /* Java calls these via evaluateJavascript. The payload is base64 so nothing in a
       response body can escape the string literal it rides in on. */
    _resolve: function (id, status, b64) {
      var p = bridgeFetch.pending[id];
      if (!p) return;
      delete bridgeFetch.pending[id];
      clearTimeout(p.t);
      var text = "";
      try { text = decodeURIComponent(escape(atob(b64 || ""))); }
      catch (e) { try { text = atob(b64 || ""); } catch (e2) { text = ""; } }
      p.res({
        ok: status >= 200 && status < 300,
        status: status,
        text: text,
        json: function () {
          try { return JSON.parse(text); } catch (e) { return null; }
        }
      });
    },

    _reject: function (id, msg) {
      var p = bridgeFetch.pending[id];
      if (!p) return;
      delete bridgeFetch.pending[id];
      clearTimeout(p.t);
      p.rej(new Error(String(msg || "bridge fetch failed")));
    }
  };

  /* ---------------- persisted settings ----------------
     localStorage is the source of truth (spec), but a wall panel gets force-stopped and
     wiped more than a phone browser does, so every write is also mirrored into Android
     SharedPreferences and used as a fallback if localStorage comes back empty. */
  var WIDGETS = ["clock", "weather", "hourly", "daily", "moon", "air", "calendar",
                 "news", "sensors", "system", "timer", "settings"];
  var WIDGET_LABELS = {
    clock: "Clock", weather: "Weather now", hourly: "Hourly forecast",
    daily: "Daily forecast", moon: "Moon phase", air: "Air quality",
    calendar: "Calendar", news: "News headlines", sensors: "Home Assistant", system: "Device",
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
      sky:        true,
      cycle:      false,
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
        d.sky = saved.sky !== false;
        d.cycle = saved.cycle === true;
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
      WP.applyVisibility();
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
      WP.applyVisibility();
      listeners.forEach(function (fn) { try { fn("*", null); } catch (e) {} });
    },

    onChange: function (fn) { listeners.push(fn); },

    /* Temperature unit suffix used all over the weather widgets. */
    tempUnit: function () { return settings.data.units === "celsius" ? "C" : "F"; },
    isMetric: function () { return settings.data.units === "celsius"; }
  };

  /* ---------------- WMO weather codes -> words ----------------
     Open-Meteo returns WMO codes; the words come from this table and the picture comes
     from WP.wxIcon (wx-icons.js) — our own coloured SVG, drawn per code. This table used
     to also carry text-presentation glyph pairs chosen to dodge Android's emoji sprites;
     drawing the icons ourselves retired that whole constraint. */
  var WMO = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm"
  };
  function wmo(code, night) {
    return { text: WMO[code] || "Unknown", night: !!night };
  }

  /* ---------------- plugin registry ---------------- */
  var registry = {};
  function register(p) { registry[p.name] = p; }

  /* The rest of the runtime arrives in two more files — app-view.js (formatting,
     layout, drift) and app-touch.js (panels, gestures, idle, boot) — which extend this
     object as they parse. Split at 500 lines per file; the seams are the same section
     banners the single file had. */
  return {
    C: C, $: $, qs: qs, qsa: qsa, esc: esc, pad2: pad2,
    status: setStatus, toast: toast,
    bridge: bridge, store: store,
    settings: settings, WIDGETS: WIDGETS, WIDGET_LABELS: WIDGET_LABELS,
    bridgeFetch: bridgeFetch, fetchOrigins: fetchOrigins, originOf: originOf,
    wmo: wmo, register: register, registry: registry
  };
})();
