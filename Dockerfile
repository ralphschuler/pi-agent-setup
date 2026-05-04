FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @mariozechner/pi-coding-agent

WORKDIR /opt/pi-agent-setup

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run check \
  && npm run test:ci \
  && npm run install:pi

CMD ["pi", "--help"]
