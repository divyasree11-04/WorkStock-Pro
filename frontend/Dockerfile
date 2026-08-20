FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY . .

# ✅ ADD THESE
ARG VITE_API_BASE_URL
ARG VITE_EMS_URL
ARG VITE_LOGO_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_EMS_URL=$VITE_EMS_URL
ENV VITE_LOGO_URL=$VITE_LOGO_URL

RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 80
CMD ["serve", "-s", "dist", "-l", "80"]