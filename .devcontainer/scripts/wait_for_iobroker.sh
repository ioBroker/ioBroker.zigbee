#!/bin/bash

set -e

# Start tailing the iobroker boot log and kill it when the script exits
tail -f -n 100 /opt/iobroker/log/boot.log &
TAIL_PID_BOOT=$!

# Ensure the tail process is killed when the script exits
trap "kill $TAIL_PID_BOOT" EXIT

# wait for ioBroker to become ready
echo "⏳ Waiting for ioBroker to become ready..."

ATTEMPTS=20
SLEEP=0.5
i=1

while [ $i -le $ATTEMPTS ]; do
    if iob status > /dev/null 2>&1; then
        echo "✅ ioBroker is ready."
        break
    else
        echo "⌛ Attempt $i/$ATTEMPTS: Waiting for ioBroker..."
        sleep $SLEEP
        i=$((i + 1))
    fi
done

if ! iob status > /dev/null 2>&1; then
    echo "❌ Timeout: ioBroker did not become ready in time"
    exit 1
fi