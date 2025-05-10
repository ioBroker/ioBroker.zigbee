#!/bin/bash

set -e

# execute poststart only if container was created right before
if [ -e /tmp/.postcreate_done ]; then
    rm  /tmp/.postcreate_done
else
    # Wait for ioBroker to become ready
    sh .devcontainer/scripts/wait_for_iobroker.sh
fi