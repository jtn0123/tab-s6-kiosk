#!/system/bin/sh
# tab-s6-kiosk boot script (Magisk service.d)
#   patch G - cap charging at 80% to protect the cell on 24/7 power
#   patch H - keep wireless adb up on the pinned port across reboots
#
# Runs late in boot, after /data is mounted. The sleep lets the power-supply
# driver and the settings provider come up first.
sleep 40

# --- patch G: charge cap -------------------------------------------------
echo 80 > /sys/class/power_supply/battery/batt_full_capacity

# --- patch H: wireless adb on a fixed port -------------------------------
# The port is pinned by a persist. prop, but adb_wifi_enabled resets to 0
# on every boot, so re-arm it here.
setprop persist.adb.tls_server.port 5555
settings put global adb_wifi_enabled 1
