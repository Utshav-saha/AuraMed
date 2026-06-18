import re
import pandas as pd
import math
from supabase import create_client, Client
from openai import OpenAI

# 1. Initialize Supabase and OpenAI
SUPABASE_URL = "https://euhinjnodoxqablltqxv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1aGluam5vZG94cWFibGx0cXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzMzU0NywiZXhwIjoyMDk2NTA5NTQ3fQ.a5S02Q7_ZTd8aWRLcDIAZxqAxLncRrue-UQWmD5-cLc" # Use service key to bypass Row Level Security
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

client = OpenAI(api_key="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")

def clean_df(df):
    """Replaces NaN values with None so PostgreSQL accepts them as NULL"""
    return df.where(pd.notnull(df), None)

def get_embedding(text):
    """Generates OpenAI vector embeddings"""
    if not text: return None
    try:
        response = client.embeddings.create(
            input=str(text),
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None

# 2. Insert Generics
def insert_generics():
    print("Loading generic_with_ids.csv...")
    df_gen = clean_df(pd.read_csv("generic_with_ids.csv"))
    
    records = []
    total_rows = len(df_gen)
    
    print(f"Starting upload of {total_rows} Generics and generating AI embeddings...")
    for index, row in df_gen.iterrows():
        # Generate Vector using the pre-cleaned string we made earlier
        embedding = get_embedding(row.get('ai_embedding_text'))

        # Map to Supabase columns
        records.append({
            "id": row["generic id"],
            "name": row["generic name"],
            "slug": row["slug"],
            "monograph_link": row["monograph link"],
            
            # Foreign Keys
            "drug_classes_id": row.get("drug_classes_id"), 
            "indication_name": row.get("indication"), 
            
            # Plain text descriptions (HTML already purged)
            "indication_description": row.get("indication description"),
            "therapeutic_class_description": row.get("therapeutic class description"),
            "pharmacology_description": row.get("pharmacology description"),
            "dosage_description": row.get("dosage description"),
            "administration_description": row.get("administration description"),
            "interaction_description": row.get("interaction description"),
            "contraindications_description": row.get("contraindications description"),
            "side_effects_description": row.get("side effects description"),
            "pregnancy_and_lactation_description": row.get("pregnancy and lactation description"),
            "precautions_description": row.get("precautions description"),
            "pediatric_usage_description": row.get("pediatric usage description"),
            "overdose_effects_description": row.get("overdose effects description"),
            "duration_of_treatment_description": row.get("duration of treatment description"),
            "reconstitution_description": row.get("reconstitution description"),
            "storage_conditions_description": row.get("storage conditions description"),
            
            "leaflet_embedding": embedding
        })
        
        # Batch insert every 100 rows to prevent timeouts and memory overloads
        if len(records) >= 100:
            print(f"Upserting generics batch... (Row {index + 1}/{total_rows})")
            supabase.table("generics").upsert(records).execute()
            records = []
            
    if records: # Insert any remaining rows
        print("Upserting final generics batch...")
        supabase.table("generics").upsert(records).execute()
    print("Generics upload complete!")

if __name__ == "__main__":
    insert_generics()
    print("All data successfully seeded into Supabase!")