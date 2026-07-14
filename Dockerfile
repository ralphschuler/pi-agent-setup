FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @mariozechner/pi-coding-agent@0.73.0

WORKDIR /opt/pi-agent-setup

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run test:ci \
  && PI_SETUP_SKIP_DEPS=1 PI_SETUP_SKIP_CHECK=1 npm run install:pi

CMD ["pi", "--help"]
