import os
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer # Nomic AI model for semantic text embedding
from supabase import create_client, Client
from google import genai

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize Clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# Load Local Model
print("Loading semantic text embedding model into memory...")
model = SentenceTransformer('nomic-ai/nomic-embed-text-v1.5', trust_remote_code=True)