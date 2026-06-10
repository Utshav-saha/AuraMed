import pandas as pd
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

print("Downloading and loading the Nomic AI model (this will take a minute on the first run)...")
# We add trust_remote_code=True because Nomic uses a custom highly-optimized architecture
model = SentenceTransformer('nomic-ai/nomic-embed-text-v1.5', trust_remote_code=True)

# For Nomic, it is highly recommended to add a "search_document: " prefix to the text 
# being saved in the database. This drastically improves retrieval accuracy later!
def get_nomic_embedding(text):
    if pd.isna(text) or str(text).strip() == "":
        return None
    # Add the prefix Nomic was trained on
    formatted_text = f"search_document: {str(text)}"
    return model.encode(formatted_text).tolist()

def generate_csv_embeddings(input_csv, text_column, output_column, output_csv):
    print(f"\nProcessing {input_csv}...")
    df = pd.read_csv(input_csv)
    
    embeddings = []
    for text in tqdm(df[text_column], desc="Generating Embeddings"):
        embeddings.append(get_nomic_embedding(text))
            
    df[output_column] = embeddings
    df.to_csv(output_csv, index=False)
    print(f"Saved updated file to {output_csv}")

if __name__ == "__main__":
    generate_csv_embeddings(
        input_csv="generic_with_ids.csv",
        text_column="ai_embedding_text",
        output_column="leaflet_embedding",
        output_csv="generic_with_embeddings.csv"
    )
    
    print("\nPreparing medicine search strings...")
    df_med = pd.read_csv("medicine_with_ids.csv")
    df_med['search_string'] = (
        "Brand: " + df_med['brand name'].fillna('') + 
        ", Generic: " + df_med['generic'].fillna('') + 
        ", Use: " + df_med['type'].fillna('')
    )
    df_med.to_csv("medicine_with_ids.csv", index=False)
    
    generate_csv_embeddings(
        input_csv="medicine_with_ids.csv",
        text_column="search_string",
        output_column="medicine_search_embedding",
        output_csv="medicine_with_embeddings.csv"
    )
    
    print("\nAll top-tier local embeddings successfully generated!")