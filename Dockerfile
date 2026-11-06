# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /out/slipway ./cmd/appbox

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/slipway /app/slipway
COPY catalog /app/catalog
COPY --from=web /src/web/dist /app/web/dist
ENV SLIPWAY_ADDR=:8080 \
    SLIPWAY_DATA=/data \
    SLIPWAY_CATALOG=/app/catalog \
    SLIPWAY_WEB=/app/web/dist
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/app/slipway"]
