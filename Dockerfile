FROM node:alpine

WORKDIR /app

# Copia package files
COPY package*.json product-migrate.js ./

# Installa dipendenze
RUN npm install --production

# Copia lo script e i file necessari
COPY migrate.js ./
COPY .env ./

# Crea directory per i log
RUN mkdir -p /app/logs

# Comando di default
CMD ["node", "product-migrate.js"]
