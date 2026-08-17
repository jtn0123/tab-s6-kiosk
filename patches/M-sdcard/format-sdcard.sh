DEV=/dev/block/vold/public:179,1

echo "=== safety check: confirm card is empty before formatting"
mkdir -p /mnt/sdchk
umount /mnt/sdchk 2>/dev/null
if mount -t sdfat -o ro $DEV /mnt/sdchk 2>/dev/null; then
  N=$(ls -A /mnt/sdchk 2>/dev/null | wc -l)
  U=$(df /mnt/sdchk | tail -1 | awk '{print $3}')
  echo "entries=$N used_kb=$U"
  umount /mnt/sdchk
  if [ "$N" -gt 0 ]; then
    echo "ABORT: card is NOT empty, refusing to format"
    exit 1
  fi
else
  echo "could not mount to verify - ABORT"
  exit 1
fi

echo "=== unmounting from vold"
sm unmount public:179,1 2>/dev/null
sleep 2

echo "=== formatting ext4 (no 4GB file limit, native Android support)"
mke2fs -t ext4 -m 0 -L External -F $DEV 2>&1 | tail -5

echo "=== what does blkid see now"
blkid $DEV

echo "=== asking vold to mount it"
sm mount public:179,1 2>&1
sleep 3
echo "=== volume state:"
sm list-volumes all
