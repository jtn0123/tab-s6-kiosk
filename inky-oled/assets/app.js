/* Wall panel dashboard — standalone. No server, no Raspberry Pi.
   Plugin-style: each card is a small module with an init() and its own refresh cadence,
   mirroring InkyPi's idea but rendered for a colour LCD instead of e-ink. */

(function () {
  "use strict";

  var C = window.CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  function setStatus(msg, warn) {
    var el = $("status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (warn ? " warn" : "");
  }

  /* ---------------- WMO weather codes -> icon + words ----------------
     Open-Meteo returns WMO codes; map them to something readable at a distance. */
  var WMO = {
    0:  ["☀", "Clear"],
    1:  ["☀", "Mostly clear"],
    2:  ["⛅", "Partly cloudy"],
    3:  ["☁", "Overcast"],
    45: ["☁", "Fog"],
    48: ["☁", "Rime fog"],
    51: ["☂", "Light drizzle"],
    53: ["☂", "Drizzle"],
    55: ["☂", "Heavy drizzle"],
    61: ["☂", "Light rain"],
    63: ["☂", "Rain"],
    65: ["☂", "Heavy rain"],
    66: ["❄", "Freezing rain"],
    67: ["❄", "Freezing rain"],
    71: ["❄", "Light snow"],
    73: ["❄", "Snow"],
    75: ["❄", "Heavy snow"],
    77: ["❄", "Snow grains"],
    80: ["☂", "Showers"],
    81: ["☂", "Showers"],
    82: ["⛈", "Heavy showers"],
    85: ["❄", "Snow showers"],
    86: ["❄", "Snow showers"],
    95: ["⛈", "Thunderstorm"],
    96: ["⛈", "Thunderstorm"],
    99: ["⛈", "Thunderstorm"]
  };
  function wmo(code) { return WMO[code] || ["·", ""]; }

  /* ---------------- plugin: clock ---------------- */
  var clockPlugin = {
    name: "clock",
    init: function () { this.tick(); setInterval(this.tick.bind(this), 1000); },
    tick: function () {
      var now = new Date();
      var h = now.getHours(), m = now.getMinutes();
      var ampm = "";
      if (C.clockHours === 12) {
        ampm = h >= 12 ? "PM" : "AM";
        h = h % 12; if (h === 0) h = 12;
      } else {
        h = ("0" + h).slice(-2);
      }
      $("time").textContent = h + ":" + ("0" + m).slice(-2);
      $("ampm").textContent = ampm;
      $("date").textContent = now.toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric"
      });
    }
  };

  /* ---------------- plugin: weather + forecast (Open-Meteo, no API key) ---------------- */
  var weatherPlugin = {
    name: "weather",
    init: function () {
      var loc = C.location || {};
      if (loc.latitude == null || loc.longitude == null) {
        $("wx-temp").textContent = "--°";
        $("wx-desc").textContent = "No location set";
        $("wx-meta").textContent = "Edit assets/config.js, then rebuild";
        setStatus("Set latitude/longitude in config.js to enable weather", true);
        return;
      }
      this.fetch();
      var mins = C.weatherRefreshMinutes || 15;
      setInterval(this.fetch.bind(this), mins * 60 * 1000);
    },
    fetch: function () {
      var loc = C.location;
      var tempUnit = (C.units === "celsius") ? "celsius" : "fahrenheit";
      var url = "https://api.open-meteo.com/v1/forecast"
        + "?latitude=" + encodeURIComponent(loc.latitude)
        + "&longitude=" + encodeURIComponent(loc.longitude)
        + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min"
        + "&temperature_unit=" + tempUnit
        + "&timezone=auto&forecast_days=5";

      fetch(url, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(this.render.bind(this))
        .catch(function (e) {
          setStatus("Weather unavailable (" + e.message + ") — retrying", true);
        });
    },
    render: function (d) {
      var deg = "°";
      var cur = d.current || {};
      var info = wmo(cur.weather_code);

      $("wx-icon").textContent = info[0];
      $("wx-temp").textContent = Math.round(cur.temperature_2m) + deg;
      $("wx-desc").textContent = info[1];

      var bits = [];
      if (cur.apparent_temperature != null) {
        bits.push("Feels " + Math.round(cur.apparent_temperature) + deg);
      }
      if (cur.relative_humidity_2m != null) {
        bits.push(cur.relative_humidity_2m + "% humidity");
      }
      if (C.location && C.location.name) bits.push(C.location.name);
      $("wx-meta").textContent = bits.join("   ·   ");

      // forecast row
      var fc = $("forecast");
      if (fc && d.daily && d.daily.time) {
        fc.innerHTML = "";
        for (var i = 1; i < d.daily.time.length && i <= 4; i++) {
          var day = new Date(d.daily.time[i] + "T12:00:00");
          var fi = wmo(d.daily.weather_code[i]);
          var el = document.createElement("div");
          el.className = "fc-day";
          el.innerHTML =
            '<div class="fc-name">' + day.toLocaleDateString(undefined, { weekday: "short" }) + "</div>" +
            '<div class="fc-icon">' + fi[0] + "</div>" +
            '<div class="fc-hi">' + Math.round(d.daily.temperature_2m_max[i]) + deg + "</div>" +
            '<div class="fc-lo">' + Math.round(d.daily.temperature_2m_min[i]) + deg + "</div>";
          fc.appendChild(el);
        }
      }

      var t = new Date();
      setStatus("Updated " + t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    }
  };

  /* ---------------- burn-in drift ----------------
     This panel is AMOLED. A dashboard that never moves will permanently ghost.
     Drift the whole layout on a slow cycle so nothing sits on the same pixels. */
  function startBurnInDrift() {
    var b = C.burnInProtection || {};
    if (!b.enabled) return;
    var max = b.maxShiftPx || 12;
    var every = (b.intervalSeconds || 120) * 1000;
    var el = $("drift");
    if (!el) return;

    function nudge() {
      var x = (Math.random() * 2 - 1) * max;
      var y = (Math.random() * 2 - 1) * max;
      el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
    }
    nudge();
    setInterval(nudge, every);
  }

  /* ---------------- boot ---------------- */
  var REGISTRY = { clock: clockPlugin, weather: weatherPlugin, forecast: null };

  function boot() {
    var wanted = C.plugins || ["clock", "weather", "forecast"];

    // hide any card whose plugin is not enabled
    Array.prototype.forEach.call(document.querySelectorAll("[data-plugin]"), function (node) {
      if (wanted.indexOf(node.getAttribute("data-plugin")) === -1) node.style.display = "none";
    });

    if (wanted.indexOf("clock") !== -1) clockPlugin.init();
    // forecast is rendered by the weather fetch, so it only needs the weather plugin running
    if (wanted.indexOf("weather") !== -1 || wanted.indexOf("forecast") !== -1) weatherPlugin.init();

    startBurnInDrift();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
