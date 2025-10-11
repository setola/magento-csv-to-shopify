# Usa un'immagine Python leggera
FROM python:3.11-slim

# Imposta la working dir
WORKDIR /app

# Copia requirements e installa dipendenze
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia lo script
COPY split_by_language.py .

# Copia il file CSV (oppure puoi montarlo come volume)
#COPY input.csv .

# Comando di default: esegui lo script
CMD ["python", "split_by_language.py"]
