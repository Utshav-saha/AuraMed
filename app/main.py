from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# new created api files import
from app.api import appointments, chatbot, medicines, prescription_scan, search_pharmacy , patient_page , cart , auth


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

app.include_router(
    search_pharmacy.router,
    prefix="/api/v1/pharmacies",
    tags=["Pharmacy Search Engine"]
)

app.include_router(
    chatbot.router,
    prefix="/api/v1/chat",
    tags=["Drug Safety Chatbot"]
)

app.include_router(
    prescription_scan.router,
    prefix="/api/v1/prescriptions",
    tags=["Prescription Functionalities"]
)

app.include_router(
    patient_page.router,
    prefix="/api/v1/patient_page",
    tags=["Patient Page"]
)

app.include_router(
    cart.router,
    prefix="/api/v1/cart",
    tags=["Cart Functionalities"]
)

app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"]
)

app.include_router(
    appointments.router,
    prefix = "/api/v1/appointments",
    tags = ["Appointments"]
)

@app.get("/")
async def root():
    return {"status": "healthy", "service": "AuraMed Backend Entry"}