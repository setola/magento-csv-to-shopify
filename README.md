# Migrazione Magento 2 → Shopify

Suite completa per migrare dati da Magento 2 a Shopify utilizzando le GraphQL Admin API.

## 📦 Strumenti di Migrazione

Questa suite include due strumenti specializzati:

- **`product-migrate.js`**: Migrazione prodotti con varianti, immagini, inventario
- **`customer-migrate.js`**: Migrazione clienti con indirizzi, telefoni, consensi marketing

Entrambi condividono utilities comuni per garantire prestazioni ottimali e comportamento coerente.

## 🚀 Caratteristiche

- ✅ Utilizza GraphQL Admin API di Shopify (non REST deprecate)
- ✅ Gestione intelligente dei rate limits
- ✅ Configurazione batch (start row e numero prodotti)
- ✅ **Crea E aggiorna prodotti esistenti** (usa SKU come chiave)
- ✅ Esecuzione in Docker con Node.js 22
- ✅ Variabili sensibili in .env
- ✅ Logging dettagliato per debug
- ✅ Supporto per immagini multiple
- ✅ Mapping automatico attributi Magento → Shopify

## 📋 Prerequisiti

1. Docker e Docker Compose installati
2. CSV esportato da Magento 2
3. Accesso Admin API di Shopify con i seguenti scopes:
   - `write_products`
   - `read_products`
   - `write_inventory`

## 🔧 Configurazione

### 1. Ottieni le credenziali Shopify

1. Nel pannello Shopify: **Settings → Apps and sales channels → Develop apps**
2. Crea una nuova app privata
3. Configura gli scopes necessari
4. Genera l'Admin API access token

### 2. Trova il Location ID

Esegui questa query GraphQL nel tuo Shopify Admin:

```graphql
{
  locations(first: 10) {
    edges {
      node {
        id
        name
      }
    }
  }
}
```

### 3. Configura le variabili d'ambiente

Copia `.env.example` in `.env` e compila:

```bash
cp .env.example .env
nano .env
```

```env
# Shopify
SHOPIFY_STORE_URL=tuo-negozio.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_LOCATION_ID=gid://shopify/Location/12345678

# Magento - IMPORTANTE per le immagini!
MAGENTO_BASE_URL=https://www.tuosito.com
MAGENTO_MEDIA_PATH=/pub/media/catalog/product

# CSV e Batch
CSV_PATH=./products.csv
START_ROW=0
BATCH_SIZE=100

# Rate Limiting
MAX_CONCURRENT=2
DELAY_MS=500

LOG_FILE=./logs/migration.log
```

**⚠️ Importante per le Immagini:**
- `MAGENTO_BASE_URL`: URL completo del tuo store Magento (es: `https://www.planetshooters.com`)
- `MAGENTO_MEDIA_PATH`: Percorso delle immagini prodotto (default: `/pub/media/catalog/product`)
- Gli URL delle immagini nel CSV Magento sono relativi (es: `/2/2/220_a_rem_70s.jpg`)
- Lo script costruirà automaticamente l'URL completo: `https://www.tuosito.com/pub/media/catalog/product/2/2/220_a_rem_70s.jpg`

### 4. Prepara il CSV

Posiziona il tuo file CSV esportato da Magento nella root del progetto:

```bash
products.csv
```

## 🏃 Esecuzione

### Migrazione Prodotti

#### Opzione 1: Con Docker (Consigliato)

```bash
# 1. Verifica che tutti i file siano presenti
ls -la products.csv .env product-migrate.js package.json

# 2. Crea la directory logs se non esiste
mkdir -p logs

# 3. Build dell'immagine (rimuovi cache se necessario)
docker-compose build --no-cache

# 4. Esegui la migrazione e vedi i log in tempo reale
docker-compose up

# 5. Per eseguire in background e seguire i log
docker-compose up -d
docker-compose logs -f

# 6. Per fermare il container
docker-compose down
```

**Troubleshooting Docker:**

Se il container esce immediatamente:
```bash
# Verifica che .env sia configurato correttamente
cat .env

# Verifica che il CSV esista
ls -lh products.csv

# Esegui il container in modalità interattiva per vedere gli errori
docker-compose run --rm migration node product-migrate.js

# Verifica i log dell'ultima esecuzione
docker-compose logs migration
```

#### Opzione 2: Senza Docker

```bash
# Installa dipendenze
npm install

# Esegui migrazione prodotti
npm run migrate-products
```

### Migrazione Clienti

Per la migrazione clienti, consulta la documentazione dettagliata: [`CUSTOMER_MIGRATION.md`](./CUSTOMER_MIGRATION.md)

#### Esecuzione Rapida

```bash
# Con Docker
docker compose run --rm migration npm run migrate-customers

# Senza Docker
npm run migrate-customers
```

#### Configurazione CSV Clienti

```env
# Aggiungi al tuo .env
CUSTOMERS_CSV_PATH=./data/export_customers.csv
BATCH_SIZE=50  # Batch più piccoli per i clienti
```

## 🔄 Aggiornamento Prodotti Esistenti

Lo script è **idempotente**: puoi eseguirlo più volte sugli stessi prodotti!

### Come Funziona

1. **Prima esecuzione**: Crea i prodotti nuovi su Shopify
2. **Esecuzioni successive**: 
   - Cerca ogni prodotto per SKU
   - Se esiste → **aggiorna** tutti i dati (titolo, descrizione, prezzo, immagini, inventario)
   - Se non esiste → crea nuovo prodotto

### Casi d'Uso

**Aggiornare prezzi/inventario dopo modifiche in Magento:**
```bash
# Esegui di nuovo lo stesso batch
START_ROW=0
BATCH_SIZE=500
docker-compose up
```

**Re-importare prodotti con errori:**
```bash
# Controlla il log per vedere quali SKU hanno fallito
grep "✗ Failed" logs/migration.log

# Crea un CSV con solo quei prodotti e re-importa
```

**Sincronizzazione periodica:**
```bash
# Usa cron per eseguire ogni notte
0 2 * * * cd /path/to/migration && docker-compose up
```

### Log Output

```
[INFO] Processing SKU: GLK.33781
[INFO] Found existing product for SKU GLK.33781, updating...
[SUCCESS] ↻ Updated product: Glock 33781 Firing Pin Safety GEN5
[DEBUG]   ↳ Updated 2 images
[INFO] === Migration Complete ===
[INFO] Total: 100, Success: 100 (25 created, 75 updated), Failed: 0, Skipped: 0
```

## 📊 Suddivisione in Batch

Per migrare 15.000 prodotti in batch da 500:

**Batch 1 (prodotti 0-499):**
```env
START_ROW=0
BATCH_SIZE=500
```

**Batch 2 (prodotti 500-999):**
```env
START_ROW=500
BATCH_SIZE=500
```

**Batch 3 (prodotti 1000-1499):**
```env
START_ROW=1000
BATCH_SIZE=500
```

...e così via.

### Script Bash per automazione notturna

Crea `run-batches.sh`:

```bash
#!/bin/bash

TOTAL_PRODUCTS=15000
BATCH_SIZE=500
START=0

while [ $START -lt $TOTAL_PRODUCTS ]; do
    echo "Starting batch from row $START"
    
    # Aggiorna .env
    sed -i "s/START_ROW=.*/START_ROW=$START/" .env
    sed -i "s/BATCH_SIZE=.*/BATCH_SIZE=$BATCH_SIZE/" .env
    
    # Esegui migrazione
    docker-compose up
    
    # Aspetta tra batch
    sleep 30
    
    START=$((START + BATCH_SIZE))
done

echo "Migration complete!"
```

Rendilo eseguibile e schedulalo con cron:

```bash
chmod +x run-batches.sh

# Esegui ogni notte alle 2:00 AM
crontab -e
# Aggiungi: 0 2 * * * cd /path/to/migration && ./run-batches.sh
```

## 📝 Monitoraggio

I log vengono salvati in `./logs/migration.log`:

```bash
# Segui i log in tempo reale
tail -f logs/migration.log

# Cerca errori
grep ERROR logs/migration.log

# Conta prodotti migrati con successo
grep "✓ Created product" logs/migration.log | wc -l
```

## 🔍 Rate Limits Shopify

Lo script rispetta automaticamente i rate limits di Shopify:

- **GraphQL API**: 2 richieste/secondo per store
- **Cost-based limiting**: Max 1000 punti ogni 10 secondi
- Lo script monitora i cost restanti e rallenta automaticamente

## 🗺️ Mapping Campi

| Magento 2 | Shopify | Note |
|-----------|---------|------|
| `name` | `title` | |
| `description` | `descriptionHtml` | |
| `url_key` | `handle` | |
| `price` | `variants[0].price` | Convertito in formato decimale |
| `sku` | `variants[0].sku` | **Chiave univoca per update** |
| `qty` | `inventoryQuantities.availableQuantity` | |
| `cost` | `variants[0].inventoryItem.cost` | Da `additional_attributes` |
| `manufacturer` | `vendor` | |
| `categories` | `tags` | Split per virgola |
| `meta_title` | `seo.title` | |
| `meta_description` | `seo.description` | |
| `product_online` | `status` | `>0` = ACTIVE, altrimenti DRAFT |
| `base_image` + `additional_images` | `media` | URL costruiti da MAGENTO_BASE_URL |

## ⚠️ Limitazioni Note

1. **Varianti**: Lo script crea prodotti semplici. Per prodotti configurabili serve logica custom
2. **Metafields**: Attributi custom vanno mappati su metafields Shopify
3. **Prezzi speciali**: `special_price` non è gestito (serve regola di prezzo)
4. **Categorie**: Le categorie Magento diventano tags (Shopify usa Collections)
5. **Costo prodotto**: Viene estratto da `additional_attributes.cost` se presente

## 📊 Dati Importati per Prodotto

Ogni prodotto viene importato con:
- ✅ **Informazioni base**: Titolo, descrizione, vendor, tipo prodotto
- ✅ **SEO**: Meta title, meta description, handle
- ✅ **Variante**: SKU, prezzo, costo (se presente)
- ✅ **Inventario**: Quantità disponibile per location
- ✅ **Immagini**: Tutte le immagini (base + addizionali)
- ✅ **Status**: ACTIVE se product_online > 0, altrimenti DRAFT
- ✅ **Tags**: Tutte le categorie Magento come tags

## 🐛 Troubleshooting

**Errore: "Access token invalid"**
- Verifica che l'access token sia corretto
- Controlla che gli scopes includano `write_products`

**Errore: "Location not found"**
- Il `SHOPIFY_LOCATION_ID` deve essere in formato `gid://shopify/Location/xxxxx`

**Immagini non caricate**
- Le immagini devono essere accessibili pubblicamente via HTTP/HTTPS
- Verifica che gli URL nel CSV siano corretti
- **Se le immagini nel CSV sono relative** (es: `/2/2/image.jpg`):
  - Configura `MAGENTO_BASE_URL` nel .env (es: `https://www.tuosito.com`)
  - Configura `MAGENTO_MEDIA_PATH` se diverso dal default
  - Lo script costruirà automaticamente l'URL completo
- Testa un URL immagine completo nel browser per verificare che sia accessibile

**Rate limit exceeded**
- Aumenta `DELAY_MS` nel .env (es: 1000)
- Riduci `MAX_CONCURRENT` a 1

## 📞 Supporto

Per problemi o domande, controlla:
- [Shopify GraphQL Admin API Docs](https://shopify.dev/docs/api/admin-graphql)
- Log di migrazione in `./logs/migration.log`

---

**Nota**: Testa sempre su un subset piccolo di prodotti (es: 10-20) prima di lanciare la migrazione completa!