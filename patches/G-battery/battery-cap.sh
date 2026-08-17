#!/system/bin/sh
# tab-s6-kiosk patch G: cap charging at 80% to protect the cell on 24/7 power
sleep 30
echo 80 > /sys/class/power_supply/battery/batt_full_capacity
