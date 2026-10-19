FROM docker:dind

RUN apk add --no-cache bash curl jq nano less

RUN mkdir -p /var/log/vlab /root/app \
    && touch /var/log/vlab/commands.log \
    && chmod 666 /var/log/vlab/commands.log

COPY bashrc /etc/vlab/bashrc
COPY app/ /root/app/
COPY init.sh /usr/local/bin/vlab-init.sh
RUN chmod +x /usr/local/bin/vlab-init.sh

ENV DOCKER_TLS_CERTDIR=""
WORKDIR /root

ENTRYPOINT ["/usr/local/bin/vlab-init.sh"]
