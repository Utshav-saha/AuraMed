from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# new created api files import
from app.api import medicines  


app = FastAPI(title="AuraMed")


# For frontend , allow cors
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# express er app.use er moto
app.include_router(
    medicines.router,
    prefix="/api/v1/medicines",
    tags=["Medicines Search Engine"]
)

@app.get("/")
async def root():
    return {"status": "healthy", "service": "AuraMed Backend Entry"}