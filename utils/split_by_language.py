import pandas as pd
from langdetect import detect, DetectorFactory

# Fix per avere risultati consistenti con langdetect
DetectorFactory.seed = 0

# ===== CONFIGURAZIONE =====
INPUT_FILE = "input.csv"        # CSV originale
OUTPUT_IT = "italiano.csv"      # Solo contenuti italiani
OUTPUT_OTHER = "non_italiano.csv"  # Tutti gli altri
OUTPUT_EMPTY = "vuoti.csv"      # Colonna H vuota o solo spazi
COLUMN = "description"  # Nome della colonna da controllare
              # Se intendi "ottava colonna" a prescindere dal nome, useresti df.columns[7]

def detect_lang_safe(text):
    """Ritorna la lingua rilevata oppure 'unknown'."""
    if not isinstance(text, str) or text.strip() == "":
        return "empty"
    try:
        return detect(text)
    except:
        return "unknown"

def main():
    print("📂 Carico il CSV...")
    df = pd.read_csv(INPUT_FILE)

    if COLUMN not in df.columns:
        raise ValueError(f"La colonna '{COLUMN}' non esiste nel file CSV! "
                         f"Colonne disponibili: {list(df.columns)}")

    print("🌍 Riconosco la lingua nella colonna H...")
    df["lang"] = df[COLUMN].apply(detect_lang_safe)

    # Filtri
    df_it = df[df["lang"] == "it"].drop(columns=["lang"])
    df_other = df[(df["lang"] != "it") & (df["lang"] != "empty")].drop(columns=["lang"])
    df_empty = df[df["lang"] == "empty"].drop(columns=["lang"])

    print("💾 Salvo i file...")
    df_it.to_csv(OUTPUT_IT, index=False)
    df_other.to_csv(OUTPUT_OTHER, index=False)
    df_empty.to_csv(OUTPUT_EMPTY, index=False)

    print(f"✅ Fatto! Salvati:\n"
          f"- {OUTPUT_IT} ({len(df_it)} righe)\n"
          f"- {OUTPUT_OTHER} ({len(df_other)} righe)\n"
          f"- {OUTPUT_EMPTY} ({len(df_empty)} righe)")

if __name__ == "__main__":
    main()
