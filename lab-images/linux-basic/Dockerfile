FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash curl ca-certificates git jq nano less procps \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/log/vlab /root/lab \
    && touch /var/log/vlab/commands.log \
    && chmod 666 /var/log/vlab/commands.log

COPY bashrc /etc/vlab/bashrc

WORKDIR /root
# The container only needs to stay alive; the student shell is created with
# `docker exec bash --rcfile /etc/vlab/bashrc -i` so logging always applies.
CMD ["sleep", "infinity"]
