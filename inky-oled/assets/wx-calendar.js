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

      /* The two chevrons sit BESIDE the month they move, not at the two edges of the
         screen. They were 145 x 125 px boxes holding a 20 px glyph, pushed ~1000 device px
         apart by a title that took the remainder — so the control and the thing it controls
         were nowhere near each other, and the row read as two stray buttons. */
      var head = '<div class="cal-nav">'
        + '<div class="cal-title">' + esc(title) + "</div>"
        + '<button class="btn tappable" data-ns="calendar" data-act="prev" aria-label="Previous month">&#8249;</button>'
        + '<button class="btn tappable" data-ns="calendar" data-act="next" aria-label="Next month">&#8250;</button>'
        + "</div>";

      /* Two letters. S M T W T F S has two ambiguous pairs, and at 3 m you cannot tell
         which of the two Ss or the two Ts you are under — on a grid whose whole job is
         telling you which column a date is in. */
      var dows = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
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

      /* The YEAR section is gone. It printed "Day 229 of 365 · week 34" — the same
         sentence the Clock panel prints, in the same words, one swipe away — under a month
         grid that was floating inset at the top of the panel with 313 device px of black
         beneath it. The grid takes that height instead (see the calendar block in
         style-theme.css): a month you can read a date off from across the room is the whole
         of what this screen is, and it is now the whole of what is on it. */
      WP.repaint(WP.qs("[data-body]", panel), head + grid + back);
    },

    /* dayOfYear / isLeap / isoWeek used to live here, feeding a YEAR section that printed
       the same sentence the Clock panel prints. The section is gone and so are they; the
       DST-safe versions in WP.fmt are the ones the Clock panel uses and the ones the date
       tests cover. */
  };

  cal.monthGrid = monthGrid;
  WP.register(cal);
})();
