FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN cd packages/shared && npx tsc

ARG NEXT_PUBLIC_BASE_URL=https://launchpad.adreamer.now
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

RUN cd packages/dashboard && npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/dashboard/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/packages/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/dashboard/.next/static ./packages/dashboard/.next/static

USER nextjs
EXPOSE 3001

CMD ["node", "packages/dashboard/server.js"]
