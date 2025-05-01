#!/bin/bash

set -e

# Define log file location
LOG_FILE=/opt/iobroker/log/boot.log
mkdir -p /opt/iobroker/log

# Start logging to the file (standard output and error)
exec > >(tee "$LOG_FILE") 2>&1

/opt/scripts/iobroker_startup.sh