FROM node:24.19.0-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ARG NEXT_PUBLIC_POCKETBASE_URL
ENV NEXT_PUBLIC_POCKETBASE_URL=$NEXT_PUBLIC_POCKETBASE_URL

RUN npm run build


FROM node:24.19.0-slim  AS runner

WORKDIR /app

ENV NODE_ENV=production


#Instalar el proxy para navegar en red tor

RUN apt-get update && apt-get install -y tor && rm -rf /var/lib/apt/lists/*


RUN echo "Log notice stdout" >> /etc/tor/torrc && \
    echo "SocksPort 127.0.0.1:9050" >> /etc/tor/torrc




RUN npx --yes playwright@1.62.1 install --with-deps chromium
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public


COPY --from=builder /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder /app/node_modules/playwright ./node_modules/playwright




ENV PORT=8000


EXPOSE $PORT


VOLUME [ "/data" ]

CMD ["sh", "-c", "tor & HOSTNAME=0.0.0.0 PORT=$PORT node server.js"]
