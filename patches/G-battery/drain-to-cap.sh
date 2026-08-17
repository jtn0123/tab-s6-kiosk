#!/system/bin/sh
# Walk the battery down to the charge-cap level without unplugging the tablet.
#
# Why this exists: batt_full_capacity stops charging ABOVE its threshold but cannot
# discharge the cell. If the battery was full when you set the cap, it stays full,
# because a plugged-in tablet runs off USB power and never touches the battery.
#
# batt_slate_mode makes the device run FROM the battery while still plugged in, so
# it drains at roughly 600-700 mA. This drains to the target, then hands back to the
# cap, which holds it there from then on.
#
# Usage:  sh drain-to-cap.sh [target]     (default 80)

B=/sys/class/power_supply/battery
TARGET=${1:-80}

# Hard floor: never go below this no matter what. Guards against a bad target or a
# misread level.
FLOOR=70

# Bound the run so a wedged loop cannot drain the tablet flat: 600 x 30s = 5 hours.
# The real safety is FLOOR above; this is just a backstop against a stuck loop.
# Sizing note: draining is ~600 mA against a 7040 mAh cell, so each 1% takes about
# 7 minutes. 100% -> 80% is therefore ~2.3 hours; a 2-hour bound stops just short.
MAX_ITERS=600

# Always drop out of slate mode on exit, including Ctrl-C or a kill.
cleanup() {
    echo 0 > $B/batt_slate_mode 2>/dev/null
    echo "[$(date '+%H:%M:%S')] slate mode OFF - charging control handed back to the cap"
    echo "  final: level=$(cat $B/capacity)% status=$(cat $B/status) cap=$(cat $B/batt_full_capacity)"
}
trap cleanup EXIT INT TERM

LEVEL=$(cat $B/capacity)
echo "start: level=${LEVEL}% target=${TARGET}% floor=${FLOOR}%"

if [ "$TARGET" -lt "$FLOOR" ]; then
    echo "refusing: target ${TARGET}% is below the ${FLOOR}% floor"
    exit 1
fi

if [ "$LEVEL" -le "$TARGET" ]; then
    echo "already at or below target - nothing to do"
    exit 0
fi

echo 1 > $B/batt_slate_mode
echo "slate mode ON - discharging while plugged in"

i=0
while [ $i -lt $MAX_ITERS ]; do
    LEVEL=$(cat $B/capacity)
    CUR=$(cat $B/current_now)

    if [ "$LEVEL" -le "$TARGET" ] || [ "$LEVEL" -le "$FLOOR" ]; then
        echo "[$(date '+%H:%M:%S')] reached ${LEVEL}% - stopping"
        break
    fi

    # Re-assert slate mode every pass. Anything else that clears it - a stray
    # instance of this script exiting, or the platform resetting it - would
    # otherwise silently stop the drain while this loop kept counting.
    echo 1 > $B/batt_slate_mode

    # Every 10th iteration (~5 min) so the log stays readable
    if [ $((i % 10)) -eq 0 ]; then
        echo "[$(date '+%H:%M:%S')] level=${LEVEL}% current=${CUR}"
    fi

    i=$((i + 1))
    sleep 30
done

if [ $i -ge $MAX_ITERS ]; then
    echo "hit the ${MAX_ITERS}-iteration time bound - stopping for safety"
fi
# cleanup() runs here via the EXIT trap
