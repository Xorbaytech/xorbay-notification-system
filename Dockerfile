FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy application source
COPY . .

# Generate Prisma Client
RUN npm run prisma:generate

# Build NestJS application
RUN npm run build


# Stage 2: Production image
FROM node:22-alpine

WORKDIR /usr/src/app

# Copy package files and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies
RUN npm ci --omit=dev

# Generate Prisma Client for production node_modules
RUN npm run prisma:generate

# Copy compiled application
COPY --from=builder /usr/src/app/dist ./dist

# Run as non-root user
USER node

EXPOSE 3000

CMD ["node", "dist/src/main.js"]