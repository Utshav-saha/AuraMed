import pandas as pd
import re

def strip_html(text):
    """Removes HTML tags from a string and cleans up excess whitespace."""
    if pd.isna(text):
        return None  # Return None so it translates to NULL in Supabase
    # Replace HTML tags with a space to prevent words from merging
    clean_text = re.sub(r'<[^>]+>', ' ', str(text))
    # Remove extra whitespaces
    return " ".join(clean_text.split())

def process_and_save_generics():
    print("Loading CSVs...")
    df_gen = pd.read_csv("generic.csv")
    df_class = pd.read_csv("drug_classes.csv")

    # Rename the ID column in drug_classes
    df_class = df_class.rename(columns={
        "id": "drug_classes_id", 
        "name": "drug class"
    })

    print("Merging tables...")
    # Perform a Left Join
    df_merged = pd.merge(
        df_gen, 
        df_class[['drug_classes_id', 'drug class']], 
        on='drug class', 
        how='left'
    )

    print("Purging HTML from all description columns...")
    # List of all columns in your Kaggle CSV that contain HTML text
    html_columns = [
        'indication description', 'therapeutic class description',
        'pharmacology description', 'dosage description',
        'administration description', 'interaction description',
        'contraindications description', 'side effects description',
        'pregnancy and lactation description', 'precautions description',
        'pediatric usage description', 'overdose effects description',
        'duration of treatment description', 'reconstitution description',
        'storage conditions description'
    ]

    # Apply the HTML stripper to every single one of those columns
    for col in html_columns:
        if col in df_merged.columns:
            df_merged[col] = df_merged[col].apply(strip_html)

    print("Compiling AI embedding text...")
    # Because the columns are already clean, we can just concatenate them directly
    # Using fillna('') to prevent 'None' from literally appearing in the AI text string
    df_merged['ai_embedding_text'] = (
        "Indication: " + df_merged['indication description'].fillna('') + 
        " Pharmacology: " + df_merged['pharmacology description'].fillna('') + 
        " Dosage: " + df_merged['dosage description'].fillna('') + 
        " Side Effects: " + df_merged['side effects description'].fillna('')
    )

    # Save the result to a new CSV
    output_filename = "generic_with_ids.csv"
    df_merged.to_csv(output_filename, index=False)
    print(f"Success! Pure text dataset saved to {output_filename}")

if __name__ == "__main__":
    process_and_save_generics()