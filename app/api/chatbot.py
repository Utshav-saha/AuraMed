import asyncio

from fastapi import APIRouter, HTTPException, Query, status

# pura data eksathe na pathaye , chunk kore pathabe , tai streaming response and async generator use kora hocche
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import AsyncGenerator, Optional
import json
from google.genai import types
from app.database import supabase, model, gemini_client

router = APIRouter()

class chatRequest(BaseModel):
    user_question: str
    generic_id: Optional[int] = None


async def stream_generator(user_question: str, context_text: str) -> AsyncGenerator[str, None]:
    """
    
    iterates over the stream chunks, and formats them as Server-Sent Events (SSE).

    """
    system_prompt = (
        "You are a precise, clinical drug safety assistant. Your sole responsibility "
        "is to answer the user's medical or safety question using ONLY the provided official drug leaflet context.Don't invent anything yourself\n"
        "CRITICAL RULES:\n"
        "1. If the context text is completely empty, or if the answer cannot be explicitly found "
        "within the text, reply exactly with: 'I am sorry, but I cannot find that information in the official drug specifications.'\n"
        "2. Do not use any pre-trained external medical knowledge outside the provided text.\n"
        "3. Keep your advice clinical, objective, and accurate to the document.\n\n"
        f"OFFICIAL LEAFLET CONTEXT:\n{context_text}\n\n"
        f"USER QUESTION: {user_question}\n\n"
        "ASSISTANT ANSWER:"
    )
    try:
        response_stream = gemini_client.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=system_prompt
        )

        for chunk in response_stream:
            if chunk.text:
                # Format chunk according to standard SSE (Server-Sent Events) guidelines
                # geminir pura response er jonno wait na kore, jehetu streaming response, tai chunk asar sathe sathe client ke pathano hocche
                yield f"data: {chunk.text}\n\n"
                await asyncio.sleep(0.01)
                
    except Exception as e:
        yield f"data: [ERROR: Failed to generate streaming response: {str(e)}]\n\n"


@router.post("/chatbot")
async def chat_drug_safety(payload: chatRequest):
    try:
        formatted_query = f"search_query: {payload.user_question}"
        query_vector = model.encode(formatted_query).tolist()

        safe_generic_id = payload.generic_id if payload.generic_id != 0 else None

        rpc_params = {
            "query_embedding": query_vector,
            "match_threshold": 0.4,
            "match_count": 1, 
            "target_generic_id": safe_generic_id
        }
        
        db_response = supabase.rpc("match_leaflets", rpc_params).execute()
        
        context_text = ""
        if db_response.data and len(db_response.data) > 0:
            context_text = db_response.data[0].get("content", "")
        
        return StreamingResponse(
            stream_generator(payload.user_question, context_text),
            media_type="text/event-stream"
        )

    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during processing: {str(err)}"
        )

