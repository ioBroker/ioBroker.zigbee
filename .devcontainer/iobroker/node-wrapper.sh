#!/bin/bash

# Wrap the Node.js binary to handle NODE_OPTIONS as command-line arguments.
# This workaround addresses https://github.com/nodejs/node/issues/37588, where
# NODE_OPTIONS is not respected when running Node.js with capabilities as a non-root user.
# The wrapper script reads the NODE_OPTIONS environment variable and converts it into
# standard command-line arguments. For example:
# NODE_OPTIONS=--inspect node main.js
# becomes:
# node.real --inspect main.js
# This ensures debugging, and other features relying on NODE_OPTIONS work properly
# for non-root users, such as in VS Code Remote Containers.

NODE_ARGS=()

if [[ -n "$NODE_OPTIONS" ]]; then
    eval "read -r -a NODE_ARGS <<< \"$NODE_OPTIONS\""
    unset NODE_OPTIONS
fi

REAL_NODE="$(command -v node).real"
exec "$REAL_NODE" "${NODE_ARGS[@]}" "$@"