FROM node:22-alpine AS builder

WORKDIR /usr/src/app

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine

WORKDIR /usr/src/app

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3002

CMD [ "node", "dist/src/main.js" ]
