# Devcontainer readme
This directory allows you to develop your adapter in a dedicated Docker container. To get started and for requirements, please read the getting started section at https://code.visualstudio.com/docs/remote/containers#_getting-started

Once you're done with that, VSCode will prompt you to reopen the adapter directory in a container. This takes a while. Afterward, you can access the admin UI by the forwarded port **Ports** panel in VS Code. 

1. Open the **Ports** panel in VS Code (look for the "Ports" tab in the bottom panel or use the Command Palette with `Ctrl+Shift+P` and search for "Ports: Focus on Ports View").
2. Locate the forwarded port for the admin UI (usually dynamically assigned).
3. Click the link in the **Ports** panel to open the admin UI in your browser.

By default, the admin UI is available at `http://localhost:<forwarded-port>`.
To change the port, edit `devcontainer.json` to have a different `forwardPorts` configuration for `nginx`.

## Setup
1) Configure your device in [postcreate_ext.sh](scripts/postcreate_ext.sh)