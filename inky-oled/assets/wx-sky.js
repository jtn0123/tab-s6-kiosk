/* Wall panel dashboard — SKY (animated background).

   A full-screen canvas behind the dashboard that draws what the weather is doing: stars
   on a clear night, a warm glow on a clear day, drifting cloud banks, falling rain or
   snow, fog banks, and a dim occasional flash in a storm. This is the "the panel is a
   window" layer — it is why the theme is allowed to stay dark: the background is not
   empty, it is the weather.

   AMOLED rules the layer lives by:
     * everything moves — a canvas whose pixels never sit still cannot burn in, which is
       why the glows wander and even the stars twinkle;
     * dim by construction — nothing here exceeds ~0.25 alpha, and most of the frame
       stays true black (pixels off);
     * 30 fps, not 60 — half the GPU work, invisible for weather;
     * it stops completely when the app is hidden or the switch in Settings is off.

   The scene is chosen from the same Open-Meteo payload the cards read (subscribed via
   weather.onData), so the background never disagrees with the Now card.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows
   writes the separator as a backslash and file:///android_asset/ cannot resolve it).
*/

(function () {
  "use strict";

  var S = WP.settings;

  /* WMO code -> scene. Pure and exported: the tests pin every code to a scene so a new
     code cannot silently fall through to "clear" while the icon shows a thunderstorm. */
  function sceneFor(code) {
    if (code === 0 || code === 1) return "clear";
    if (code === 2) return "partly";
    if (code === 3) return "cloudy";
    if (code === 45 || code === 48) return "fog";
    if (code >= 51 && code <= 57) return "drizzle";
    if (code >= 71 && code <= 77) return "snow";
    if (code === 85 || code === 86) return "snow";
    if (code === 82 || code === 95 || code === 96 || code === 99) return "storm";
    if (code >= 61 && code <= 67) return "rain";
    if (code === 80 || code === 81) return "rain";
    return "clear";
  }

  var sky = {
    name: "sky",
    canvas: null, ctx: null,
    w: 0, h: 0,
    scene: "clear", night: false,
    stars: [], drops: [], flakes: [], clouds: [], bands: [],
    glowSeed: Math.random() * 1000,
    flashAt: 0, flashNext: 0,
    raf: 0, last: 0, acc: 0,
    col: {},

    init: function () {
      var c = document.getElementById("sky");
      /* The test DOM has no canvas contexts and no rAF; the layer simply stays off
         there — everything testable about it (sceneFor, the settings switch) is pure. */
      if (!c || typeof c.getContext !== "function"
             || typeof requestAnimationFrame !== "function") return;
      this.canvas = c;
      this.ctx = c.getContext("2d");
      if (!this.ctx) { this.canvas = null; return; }
      this.readPalette();
      this.resize();
      window.addEventListener("resize", this.resize.bind(this));

      var self = this;
      /* follow the same payload the cards render from */
      if (WP.registry.weather && WP.registry.weather.onData) {
        WP.registry.weather.onData(function (d) {
          var cur = d && d.current;
          if (!cur) return;
          self.set(sceneFor(cur.weather_code), cur.is_day === 0);
        });
      }
      S.onChange(function (k) {
        if (k === "sky" || k === "*") self.apply();
      });
      document.addEventListener("visibilitychange", function () { self.apply(); });
      this.apply();
    },

    readPalette: function () {
      var cs = (typeof getComputedStyle === "function")
        ? getComputedStyle(document.documentElement) : null;
      if (!cs) { this.col = { rain: "#5aa9ff", snow: "#d6efff", star: "#cfd4ff" }; return; }
      function v(name, fb) { return (cs.getPropertyValue(name) || fb).trim() || fb; }
      this.col = {
        rain: v("--ic-rain", "#5aa9ff"),
        snow: v("--ic-snow", "#d6efff"),
        star: v("--ic-star", "#cfd4ff")
      };
    },

    resize: function () {
      var c = this.canvas;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth; this.h = window.innerHeight;
      c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seed();
    },

    set: function (scene, night) {
      if (scene === this.scene && night === this.night) return;
      this.scene = scene; this.night = night;
      this.seed();
      this.apply();
    },

    on: function () { return S.get("sky") !== false && !document.hidden; },

    apply: function () {
      if (!this.canvas) return;
      if (this.on()) {
        if (!this.raf) { this.last = 0; this.loop(); }
      } else if (this.raf) {
        cancelAnimationFrame(this.raf); this.raf = 0;
        this.ctx.clearRect(0, 0, this.w, this.h);
      }
    },

    seed: function () {
      var w = this.w, h = this.h, i;
      this.stars = [];
      for (i = 0; i < 110; i++) this.stars.push({
        x: Math.random() * w, y: Math.random() * h * 0.85,
        r: 0.6 + Math.random() * 1.2,
        ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 1.2
      });
      this.drops = [];
      for (i = 0; i < 110; i++) this.drops.push({
        x: Math.random() * w, y: Math.random() * h,
        l: 12 + Math.random() * 14, v: 380 + Math.random() * 240
      });
      this.flakes = [];
      for (i = 0; i < 70; i++) this.flakes.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 1 + Math.random() * 1.6, v: 40 + Math.random() * 50,
        ph: Math.random() * 6.28
      });
      this.clouds = [];
      for (i = 0; i < 6; i++) this.clouds.push({
        x: Math.random() * w, y: Math.random() * h * 0.7,
        rx: 120 + Math.random() * 160, ry: 34 + Math.random() * 26,
        v: 4 + Math.random() * 7, a: 0.035 + Math.random() * 0.03
      });
      this.bands = [];
      for (i = 0; i < 4; i++) this.bands.push({
        y: h * (0.15 + 0.22 * i), hh: 40 + Math.random() * 30,
        x: Math.random() * w, v: 6 + Math.random() * 8, a: 0.05 + Math.random() * 0.03
      });
      this.flashNext = 4000 + Math.random() * 9000;
    },

    loop: function () {
      var self = this;
      this.raf = requestAnimationFrame(function (ts) {
        if (!self.on()) { self.raf = 0; return; }
        if (!self.last) self.last = ts;
        var dt = Math.min(ts - self.last, 100);
        self.last = ts;
        self.acc += dt;
        if (self.acc >= 33) {           // ~30 fps
          self.draw(self.acc / 1000, ts / 1000);
          self.acc = 0;
        }
        self.loop();
      });
    },

    draw: function (dt, t) {
      var x = this.ctx, w = this.w, h = this.h, sc = this.scene, i;
      x.clearRect(0, 0, w, h);

      /* -- glow: the sun or the moon, wandering slowly so it cannot burn in -- */
      if (sc === "clear" || sc === "partly") {
        var gx = w * 0.80 + Math.sin(t * 0.013 + this.glowSeed) * w * 0.05;
        var gy = h * 0.12 + Math.cos(t * 0.017 + this.glowSeed) * h * 0.03;
        var gr = h * (this.night ? 0.34 : 0.46) * (1 + Math.sin(t * 0.05) * 0.04);
        var g = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
        if (this.night) {
          g.addColorStop(0, "rgba(190,196,255,0.13)");
          g.addColorStop(1, "rgba(190,196,255,0)");
        } else {
          g.addColorStop(0, "rgba(255,178,84,0.17)");
          g.addColorStop(1, "rgba(255,178,84,0)");
        }
        x.fillStyle = g;
        x.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }

      /* -- stars: clear/partly nights only -- */
      if (this.night && (sc === "clear" || sc === "partly")) {
        x.fillStyle = this.col.star;
        for (i = 0; i < this.stars.length; i++) {
          var s = this.stars[i];
          var tw = 0.25 + 0.75 * Math.abs(Math.sin(t * s.sp + s.ph));
          x.globalAlpha = tw * 0.5;
          x.fillRect(s.x, s.y, s.r, s.r);
        }
        x.globalAlpha = 1;
      }

      /* -- cloud banks: partly/cloudy/rain-family carry them -- */
      if (sc !== "clear" && sc !== "fog") {
        for (i = 0; i < this.clouds.length; i++) {
          var c = this.clouds[i];
          if (sc === "partly" && i > 2) continue;   // partly = fewer banks
          c.x += c.v * dt;
          if (c.x - c.rx > w) c.x = -c.rx;
          var cg = x.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.rx);
          cg.addColorStop(0, "rgba(150,170,200," + c.a + ")");
          cg.addColorStop(1, "rgba(150,170,200,0)");
          x.fillStyle = cg;
          x.save();
          x.translate(c.x, c.y); x.scale(1, c.ry / c.rx); x.translate(-c.x, -c.y);
          x.fillRect(c.x - c.rx, c.y - c.rx, c.rx * 2, c.rx * 2);
          x.restore();
        }
      }

      /* -- rain / drizzle: angled streaks -- */
      if (sc === "rain" || sc === "drizzle" || sc === "storm") {
        var n = sc === "drizzle" ? 55 : this.drops.length;
        x.strokeStyle = this.col.rain;
        x.lineWidth = 1.3;
        x.globalAlpha = sc === "drizzle" ? 0.16 : 0.24;
        x.beginPath();
        for (i = 0; i < n; i++) {
          var d = this.drops[i];
          var v = sc === "drizzle" ? d.v * 0.55 : d.v;
          d.y += v * dt; d.x -= v * 0.18 * dt;
          if (d.y > h) { d.y = -d.l; d.x = Math.random() * (w * 1.2); }
          var ll = sc === "drizzle" ? d.l * 0.6 : d.l;
          x.moveTo(d.x, d.y);
          x.lineTo(d.x + ll * 0.18, d.y - ll);
        }
        x.stroke();
        x.globalAlpha = 1;
      }

      /* -- snow: drifting flakes with sway -- */
      if (sc === "snow") {
        x.fillStyle = this.col.snow;
        x.globalAlpha = 0.5;
        for (i = 0; i < this.flakes.length; i++) {
          var f = this.flakes[i];
          f.y += f.v * dt;
          f.x += Math.sin(t * 0.8 + f.ph) * 14 * dt;
          if (f.y > h) { f.y = -3; f.x = Math.random() * w; }
          x.beginPath();
          x.arc(f.x, f.y, f.r, 0, 6.283);
          x.fill();
        }
        x.globalAlpha = 1;
      }

      /* -- fog: soft horizontal bands sliding sideways -- */
      if (sc === "fog") {
        for (i = 0; i < this.bands.length; i++) {
          var b = this.bands[i];
          b.x += b.v * dt;
          if (b.x > w) b.x = 0;
          var bg = x.createLinearGradient(0, b.y - b.hh, 0, b.y + b.hh);
          bg.addColorStop(0, "rgba(154,168,184,0)");
          bg.addColorStop(0.5, "rgba(154,168,184," + b.a + ")");
          bg.addColorStop(1, "rgba(154,168,184,0)");
          x.fillStyle = bg;
          /* two copies so the band wraps seamlessly */
          x.fillRect(b.x - w, b.y - b.hh, w, b.hh * 2);
          x.fillRect(b.x, b.y - b.hh, w, b.hh * 2);
        }
      }

      /* -- storm: everything rain does, plus a dim flash every few seconds -- */
      if (sc === "storm") {
        this.flashNext -= dt * 1000;
        if (this.flashNext <= 0) {
          this.flashAt = t;
          this.flashNext = 6000 + Math.random() * 12000;
        }
        var since = (t - this.flashAt) * 1000;
        if (since < 260) {
          x.fillStyle = "rgba(210,220,255," + (0.13 * (1 - since / 260)) + ")";
          x.fillRect(0, 0, w, h);
        }
      }
    },

    onOpen: function () {}, onClose: function () {}
  };

  sky.sceneFor = sceneFor;
  WP.sky = sky;
  WP.register(sky);
})();
