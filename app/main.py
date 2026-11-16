from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import open_pool, close_pool
from app.api import (
    appointments, chatbot, medicines, prescription_scan,
    search_pharmacy, patient_page, cart, auth,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await open_pool()
    yield
    await close_pool()


app = FastAPI(title="AuraMed", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# express er app.use er moto
app.include_router(medicines.router, prefix="/api/v1/medicines", tags=["Medicines"])
app.include_router(search_pharmacy.router, prefix="/api/v1/pharmacies", tags=["Pharmacies"])
app.include_router(chatbot.router, prefix="/api/v1/chat", tags=["Chatbot"])
app.include_router(prescription_scan.router, prefix="/api/v1/prescriptions", tags=["Prescriptions"])
app.include_router(patient_page.router, prefix="/api/v1/patient_page", tags=["Patient"])
app.include_router(cart.router, prefix="/api/v1/cart", tags=["Cart"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(appointments.router, prefix="/api/v1/appointments", tags=["Appointments"])


@app.get("/")
async def root():
    return {"status": "healthy", "service": "AuraMed Backend Entry"}
