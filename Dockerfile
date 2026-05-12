FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
ARG UMI_APP_API_BASE_URL=
ENV UMI_APP_API_BASE_URL=$UMI_APP_API_BASE_URL
RUN pnpm build

FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_PROXY_PASS=http://host.docker.internal:8080
ENV AI_RELAY_STORAGE_ROOT=/var/lib/ai-relay/storage
EXPOSE 80
