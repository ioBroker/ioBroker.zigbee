#!/bin/bash

set -e

# Wait for ioBroker to become ready
sh .devcontainer/scripts/wait_for_iobroker.sh

echo "➡️  Install dependencies"
npm install

echo "➡️  Packaging adapter"
NPM_PACK=$(npm pack)

echo "➡️  Delete discovery adapter"
iob del discovery

echo "➡️  Disable error reporting"
iob plugin disable sentry

echo "➡️  Disable sending diagnostics"
iob object set system.config common.diag=false

echo "➡️  Set the license as confirmed"
iob object set system.config common.licenseConfirmed=true

echo "➡️  Install the adapter"
iob url "$(pwd)/$NPM_PACK" --debug

ADAPTER_NAME=$(jq -r '.name | split(".")[1]' package.json)
echo "➡️  Create a $ADAPTER_NAME instance"
iob add $ADAPTER_NAME

echo "➡️  Stop $ADAPTER_NAME instance"
iob stop $ADAPTER_NAME

echo "➡️  Delete the adapter package"
rm "$NPM_PACK"

touch /tmp/.postcreate_done