# Step 1: Build React app using pnpm
FROM node:22.12.0 AS build
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy dependency files and install
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install

# Copy rest of the app and build
COPY . .
RUN pnpm run build

# Step 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
