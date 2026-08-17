/* ============================================================
   INKY OLED — CONFIG
   Edit this file, rebuild, reinstall. It is the only file you
   should normally need to touch.
   ============================================================ */

window.CONFIG = {

  // ---- LOCATION (required for weather) --------------------
  // !! CHANGE THESE !! Currently a placeholder used for testing.
  // Find your own at https://www.latlong.net/
  // Set latitude/longitude to null to show a "set your location" notice instead.
  location: {
    name: "Seattle",
    latitude:  47.6062,
    longitude: -122.3321,
  },

  // "fahrenheit" or "celsius"
  units: "fahrenheit",

  // 12 or 24 hour clock
  clockHours: 12,

  // ---- PLUGINS --------------------------------------------
  // Turn cards on/off. Order here is the order they render.
  plugins: ["clock", "weather", "forecast"],

  // ---- REFRESH --------------------------------------------
  weatherRefreshMinutes: 15,

  // ---- BURN-IN PROTECTION ---------------------------------
  // This panel is AMOLED. Static content ghosts permanently.
  // The whole layout drifts a few pixels on a slow cycle so no element
  // sits on the same pixels for hours. Costs nothing, invisible in use.
  burnInProtection: {
    enabled: true,
    maxShiftPx: 12,        // how far it drifts
    intervalSeconds: 120,  // how often it moves
  },
};
