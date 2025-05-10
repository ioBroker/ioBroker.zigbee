FROM iobroker/iobroker:latest
RUN ln -s /opt/iobroker/node_modules/ /node_modules

# add ssh client to be able to work with git
RUN apt-get update \
    && apt-get -y --no-install-recommends install openssh-client

COPY node-wrapper.sh /usr/bin/node-wrapper.sh
RUN chmod +x /usr/bin/node-wrapper.sh \
    && NODE_BIN="$(command -v node)" \
    # Move the original node binary to .real
    && mv "$NODE_BIN" "${NODE_BIN}.real" \
    # Move the wrapper in place
    && mv /usr/bin/node-wrapper.sh "$NODE_BIN"

# Support sudo for non-root user
ARG USERNAME=iobroker
RUN echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

COPY boot.sh /opt/iobroker/boot.sh
RUN chmod +x /opt/iobroker/boot.sh \
    && mkdir -p /opt/iobroker/log

ENTRYPOINT ["/bin/bash", "-c", "/opt/iobroker/boot.sh"]