/* Wall panel dashboard — CALENDAR.

   A month grid, computed locally. No account, no sync — this is the "what's the date /
   when is the 28th" glance a kitchen wall calendar answers, not an agenda.

   monthGrid() is pure and exported for the tests: first-weekday offset, leap years and
   the 4/5/6-row months are exactly the class of arithmetic that looks right in August
   and breaks in February.

   One widget, one flat file (assets/ cannot hold subdirectories — aapt2 on Windows writes
   the separator as a backslash and file:///android_asset/ cannot resolve it).
*/

(function () {
  "use strict";

  var $ = WP.$, esc = WP.esc;
  var ui = WP.ui;
  var section = ui.section;

  /* Weeks start on Sunday, matching the US locale the panel is configured in.
     Returns an array of weeks; each cell is { d: dayNumber, in: sameMonth }. */
  function monthGrid(year, month) {
    var first = new Date(year, month, 1);
    var startDow = first.getDay();
    var daysIn = new Date(year, month + 1, 0).getDate();
    var daysPrev = new Date(year, month, 0).getDate();
    var cells = [];
    var i;
    for (i = startDow - 1; i >= 0; i--) cells.push({ d: daysPrev - i, in: false });
    for (i = 1; i <= daysIn; i++) cells.push({ d: i, in: true });
    var trail = (7 - (cells.length % 7)) % 7;
    for (i = 1; i <= trail; i++) cells.push({ d: i, in: false });
    var weeks = [];
    for (i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  var cal = {
    name: "calendar",
    panel: null,
    view: null,          // {y, m} the panel is showing; null = current month
    shownDate: "",

    init: function () {
      this.renderCard();
      var self = this;
      /* repaint when the date rolls over midnight */
      setInterval(function () {
        var iso = new Date().toDateString();
        if (iso !== self.shownDate) { self.renderCard(); if (self.panel) self.paintPanel(); }
      }, 60 * 1000);

      WP.onAction("calendar", function (act) {
        if (!self.view) return;
        if (act === "prev") { self.view.m--; if (self.view.m < 0) { self.view.m = 11; self.view.y--; } }
        if (act === "next") { self.view.m++; if (self.view.m > 11) { self.view.m = 0; self.view.y++; } }
        if (act === "today") { var n = new Date(); self.view = { y: n.getFullYear(), m: n.getMonth() }; }
        self.paintPanel();
      });
    },

    renderCard: function () {
      var big = $("cal-big"), sub = $("cal-sub");
      if (!big) return;
      var n = new Date();
      this.shownDate = n.toDateString();
      /* just the day number: "Aug 17" wrapped to two colliding lines in the six-across
         tile row; the month and weekday live comfortably on the sub-line */
      big.textContent = String(n.getDate());
      sub.textContent = n.toLocaleDateString(undefined, { weekday: "short" })
        + " · " + n.toLocaleDateString(undefined, { month: "short" });
    },

    onOpen: function (panel) {
      this.panel = panel;
      var n = new Date();
      this.view = { y: n.getFullYear(), m: n.getMonth() };
      this.paintPanel();
    },
    onClose: function () { this.panel = null; this.view = null; },

    paintPanel: function () {
      var panel = this.panel || WP.panels.el("calendar");
      if (!panel || !this.view) return;
      var y = this.view.y, m = this.view.m;
      var now = new Date();
      var isThisMonth = y === now.getFullYear() && m === now.getMonth();
      var today = now.getDate();

      var title = new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      WP.qs("[data-sub]", panel).textContent =
        now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

      var head = '<div class="cal-nav">'
        + '<button class="btn tappable" data-ns="calendar" data-act="prev" aria-label="Previous month">&#8249;</button>'
        + '<div class="cal-title">' + esc(title) + "</div>"
        + '<button class="btn tappable" data-ns="calendar" data-act="next" aria-label="Next month">&#8250;</button>'
        + "</div>";

      var dows = ["S", "M", "T", "W", "T", "F", "S"];
      var grid = '<div class="cal-grid" role="grid" aria-label="' + esc(title) + '">'
        + dows.map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("");
      monthGrid(y, m).forEach(function (week) {
        week.forEach(function (c) {
          var isToday = isThisMonth && c.in && c.d === today;
          grid += '<div class="cal-day' + (c.in ? "" : " out") + (isToday ? " today" : "") + '"'
            + (isToday ? ' aria-current="date"' : "") + ">" + c.d + "</div>";
        });
      });
      grid += "</div>";

      var back = isThisMonth ? "" :
        '<div class="btn-row"><button class="btn tappable" data-ns="calendar" data-act="today">'
        + "Back to today</button></div>";

      WP.repaint(WP.qs("[data-body]", panel), head + grid + back
        + section("Year", '<div class="muted">Day ' + this.dayOfYear(now) + " of "
          + (this.isLeap(now.getFullYear()) ? 366 : 365)
          + " · week " + this.isoWeek(now) + "</div>"));
    },

    dayOfYear: function (d) {
      return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    },
    isLeap: function (y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; },
    isoWeek: function (d) {
      var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      var dow = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - dow);
      var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return Math.ceil(((t - y0) / 86400000 + 1) / 7);
    }
  };

  cal.monthGrid = monthGrid;
  WP.register(cal);
})();
