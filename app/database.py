import os
import time
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer # Nomic AI model for semantic text embedding
from supabase import create_client, Client
from google import genai

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# Initialize Clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# Load Local Model
print("Loading semantic text embedding model into memory...")
model = SentenceTransformer('nomic-ai/nomic-embed-text-v1.5', trust_remote_code=True)

# import os
# import time
# from dotenv import load_dotenv
# from huggingface_hub import InferenceClient
# from huggingface_hub.utils import HfHubHTTPError

# # Explicitly load the .env file so Python can read your token
# load_dotenv()

# # 1. The Disguise (Fake NumPy Array)
# # Keeps your existing main code working flawlessly
# class FakeNumpyArray:
#     def __init__(self, data_list):
#         self.data_list = data_list
        
#     def tolist(self):
#         return self.data_list

# # 2. The Modern Hugging Face SDK Adapter pointing to the PUBLIC model
# class CloudEmbeddingAdapter:
#     def __init__(self):
#         self.hf_token = os.environ.get("HUGGINGFACE_API_KEY")
        
#         # Initialize the official client with your token
#         self.client = InferenceClient(token=self.hf_token)
        
#         # 👇 This points directly to the official public Nomic AI model
#         self.model_id = "nomic-ai/nomic-embed-text-v1.5"

#     def encode(self, text):
#         max_retries = 3
#         delay = 2

#         for attempt in range(max_retries):
#             try:
#                 # The modern SDK handles all the heavy lifting and new server URLs automatically
#                 response = self.client.feature_extraction(
#                     text, 
#                     model=self.model_id
#                 )
                
#                 vector = response
#                 # Extract the flat list of 768 dimensions if nested
#                 if isinstance(vector, list) and isinstance(vector[0], list):
#                     vector = vector[0]
                    
#                 return FakeNumpyArray(vector)
                
#             except HfHubHTTPError as e:
#                 # Catch the 503 error if the public shared server is busy or booting up
#                 if e.response.status_code == 503 and attempt < max_retries - 1:
#                     print(f"⚠️ Public Nomic server busy (503). Retrying in {delay}s... (Attempt {attempt + 1}/{max_retries})")
#                     time.sleep(delay)
#                     delay *= 2
#                 else:
#                     raise Exception(f"Hugging Face API Error: {str(e)}")
#             except Exception as e:
#                 if attempt < max_retries - 1:
#                     # 👇 Change this line to print the actual error message
#                     print(f"📡 Network glitch: {str(e)}. Retrying in {delay}s...")
#                     time.sleep(delay)
#                     delay *= 2
#                 else:
#                     raise e

# # 3. Export the Plug-and-Play Variable
# print("Connecting to Public Hugging Face Nomic Model...")
# model = CloudEmbeddingAdapter()
# print("Cloud Model Connected via Modern SDK!")