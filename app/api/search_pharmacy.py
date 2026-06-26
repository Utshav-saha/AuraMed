from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncpg
from collections import defaultdict 

from app.database import supabase, DATABASE_URL

router = APIRouter()

class SearchResponse(BaseModel):
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    available_medicine_id: int
    available_generic_id: int
    stock_count: int
    is_exact_match: bool

class SearchRequest(BaseModel):
    user_lat: float
    user_lng: float
    search_radius_meters: Optional[float] = 5000.0
    target_medicine_ids: list[int]
    target_quantities: list[int]


class CartItem(BaseModel):
    provided_medicine_id: int
    is_exact: bool

class OneStopShop(BaseModel):
    pharmacy_name: str
    address: str
    distance_meters: float
    items: List[CartItem]

class MultiStopItem(BaseModel):
    medicine_id: int
    pharmacy_name: str
    address: str
    distance_meters: float

class CartResult(BaseModel):
    one_stop_options: List[OneStopShop]
    multi_stop_route: List[MultiStopItem]

@router.post("/search-pharmacies", response_model=List[SearchResponse])
async def search_pharmacies(request: SearchRequest):

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            SELECT generic_id 
            FROM medicines
            WHERE id = ANY($1)
        """
        generic_ids = await conn.fetch(query, request.target_medicine_ids)
        
        generic_ids_list = [record['generic_id'] for record in generic_ids if record['generic_id'] is not None]

        response = supabase.rpc("find_nearby_pharmacy", {
            "user_lat": request.user_lat,
            "user_lng": request.user_lng,
            "search_radius_meters": request.search_radius_meters,
            "target_medicine_ids": request.target_medicine_ids,
            "target_generic_ids": generic_ids_list
        }).execute()

        data = response.data
        total_count = len(request.target_medicine_ids)

        pharmacy_groups = defaultdict(list)
        for row in data:
            pharmacy_groups[row['pharmacy_id']].append(row)
            
        # One stop shop options
        one_stop_options = []
        
        for pharm_id, items in pharmacy_groups.items():
            unique_generics = set(item['available_generic_id'] for item in items)
            
            if len(unique_generics) == total_count:
                pharm_info = items[0]
                one_stop_options.append({
                    "pharmacy_name": pharm_info['pharmacy_name'],
                    "address": pharm_info['address'],
                    "distance_meters": pharm_info['distance_meters'],
                    "items": [
                        {
                            "provided_medicine_id": item['available_medicine_id'],
                            "is_exact": item['is_exact_match']
                        } for item in items
                    ]
                })
                
        one_stop_options.sort(key=lambda x: x['distance_meters'])

       # Multi-stop route options
        exact_matches = [row for row in data if row['is_exact_match']]
        
        medicine_groups = defaultdict(list)
        for row in exact_matches:
            medicine_groups[row['available_medicine_id']].append(row)
            
        multi_stop_route = []
        
        for med_id, locations in medicine_groups.items():
            locations.sort(key=lambda x: x['distance_meters'])
            
            closest_location = locations[0]
            multi_stop_route.append({
                "medicine_id": med_id,
                "pharmacy_name": closest_location['pharmacy_name'],
                "address": closest_location['address'],
                "distance_meters": closest_location['distance_meters']
            })

        return CartResult(
            one_stop_options=one_stop_options,
            multi_stop_route=multi_stop_route
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
        
    finally:
        await conn.close()