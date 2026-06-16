FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build dell'applicazione Next.js per la produzione.
# NEXT_PUBLIC_* env vars vengono baked nel bundle al build time:
# passarle come --build-arg se diversi da localhost in produzione.
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
