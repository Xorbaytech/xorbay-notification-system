FROM node:22-alpine AS builder

# Create app directory
WORKDIR /usr/src/app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
COPY prisma ./prisma/

# Install app dependencies
RUN npm ci

# Copy the rest of the app source code
COPY . .

# Generate prisma client and build the app
RUN npx prisma generate
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Use non-root user for security
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD [ "node", "dist/src/main.js" ]
