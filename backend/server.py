from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import overpy
import requests
from geopy.geocoders import Nominatim

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="GoWalking API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    walk_coins: int = 0
    total_distance_km: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    name: str
    email: str

class Walk(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    route_name: str
    distance_km: float
    duration_minutes: int
    coins_earned: int
    start_point: List[float]  # [lng, lat]
    end_point: List[float]    # [lng, lat]
    city: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WalkCreate(BaseModel):
    user_id: str
    route_name: str
    distance_km: float
    duration_minutes: int
    start_point: List[float]
    end_point: List[float]
    city: str

class RouteRequest(BaseModel):
    start: List[float]  # [lng, lat]
    end: List[float]    # [lng, lat]
    city: str

class POIRequest(BaseModel):
    city: str
    amenity_type: str = "restaurant"

class Business(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    amenity_type: str
    city: str
    coordinates: List[float]  # [lng, lat]
    cuisine: Optional[str] = None
    opening_hours: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    discount_offer: Optional[str] = None
    coins_required: int = 0

class FriendRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender_id: str
    receiver_id: str
    sender_name: str
    receiver_name: str
    status: str = "pending"  # pending, accepted, declined
    created_at: datetime = Field(default_factory=datetime.utcnow)

class FriendRequestCreate(BaseModel):
    receiver_email: str

class Friendship(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user1_id: str
    user2_id: str
    user1_name: str
    user2_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WalkInvitation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender_id: str
    receiver_id: str
    sender_name: str
    receiver_name: str
    route_name: str
    start_point: List[float]
    end_point: List[float]
    city: str
    distance_km: float
    proposed_time: Optional[str] = None
    message: Optional[str] = None
    status: str = "pending"  # pending, accepted, declined, completed
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WalkInvitationCreate(BaseModel):
    receiver_id: str
    route_name: str
    start_point: List[float]
    end_point: List[float]
    city: str
    distance_km: float
    proposed_time: Optional[str] = None
    message: Optional[str] = None

# City coordinates for German cities
CITY_COORDS = {
    "regensburg": {"south": 49.0, "west": 12.0, "north": 49.1, "east": 12.2, "center": [12.12, 49.03]},
    "deggendorf": {"south": 48.8, "west": 12.9, "north": 48.9, "east": 13.0, "center": [12.96, 48.84]},
    "passau": {"south": 48.5, "west": 13.4, "north": 48.6, "east": 13.5, "center": [13.43, 48.57]}
}

# Utility functions
def calculate_coins(distance_km: float) -> int:
    """Calculate WalkCoins based on distance (1 coin per 0.5km)"""
    return int(distance_km * 2)

async def get_cached_pois(city: str, amenity_type: str):
    """Check if we have cached POI data"""
    cached = await db.cached_pois.find_one({
        "city": city, 
        "amenity_type": amenity_type,
        "cached_at": {"$gte": datetime.utcnow().replace(hour=0, minute=0, second=0)}
    })
    return cached

async def cache_pois(city: str, amenity_type: str, data: list):
    """Cache POI data for the day"""
    await db.cached_pois.replace_one(
        {"city": city, "amenity_type": amenity_type},
        {
            "city": city,
            "amenity_type": amenity_type,
            "data": data,
            "cached_at": datetime.utcnow()
        },
        upsert=True
    )

# Routes
@api_router.get("/")
async def root():
    return {"message": "GoWalking API - Ready to explore!"}

@api_router.get("/health")
async def health_check():
    return {"status": "online", "service": "GoWalking API"}

# User endpoints
@api_router.post("/users", response_model=User)
async def create_user(user_data: UserCreate):
    # Check if user already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user = User(**user_data.dict())
    await db.users.insert_one(user.dict())
    return user

@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return User(**user)

@api_router.get("/users", response_model=List[User])
async def get_users():
    users = await db.users.find().to_list(100)
    return [User(**user) for user in users]

# Route planning endpoints
@api_router.post("/route/calculate")
async def calculate_route(request: RouteRequest):
    try:
        start_lng, start_lat = request.start
        end_lng, end_lat = request.end
        
        # Try OpenRouteService if API key is available
        ors_api_key = os.environ.get('ORS_API_KEY')
        
        if ors_api_key:
            try:
                import openrouteservice as ors
                client = ors.Client(key=ors_api_key)
                
                route = client.directions(
                    coordinates=[request.start, request.end],
                    profile='foot-walking',
                    format='geojson',
                    instructions=True
                )
                
                if route and route.get('features'):
                    feature = route['features'][0]
                    properties = feature['properties']
                    geometry = feature['geometry']['coordinates']
                    
                    distance_km = properties['summary']['distance'] / 1000
                    duration_minutes = properties['summary']['duration'] / 60
                    
                    return {
                        "success": True,
                        "distance_km": round(distance_km, 2),
                        "duration_minutes": int(duration_minutes),
                        "route_geometry": geometry,
                        "coins_to_earn": calculate_coins(distance_km),
                        "source": "openrouteservice"
                    }
            except Exception as ors_error:
                print(f"OpenRouteService error: {ors_error}")
                # Fall back to mock calculation
                pass
        
        # Fallback mock calculation
        distance_km = ((end_lng - start_lng) ** 2 + (end_lat - start_lat) ** 2) ** 0.5 * 111
        duration_minutes = int(distance_km * 12)  # ~12 minutes per km walking
        
        # Mock route geometry
        route_geometry = [
            [start_lng, start_lat],
            [(start_lng + end_lng) / 2, (start_lat + end_lat) / 2],
            [end_lng, end_lat]
        ]
        
        return {
            "success": True,
            "distance_km": round(distance_km, 2),
            "duration_minutes": duration_minutes,
            "route_geometry": route_geometry,
            "coins_to_earn": calculate_coins(distance_km),
            "source": "mock"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route calculation error: {str(e)}")

# POI endpoints
@api_router.post("/poi")
async def get_poi_data(request: POIRequest):
    try:
        city = request.city.lower()
        if city not in CITY_COORDS:
            raise HTTPException(status_code=400, detail="City not supported")
        
        # Check cache first
        cached = await get_cached_pois(city, request.amenity_type)
        if cached:
            return {"success": True, "data": cached["data"], "count": len(cached["data"]), "source": "cache"}
        
        # Query Overpass API
        coords = CITY_COORDS[city]
        
        api = overpy.Overpass()
        query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="{request.amenity_type}"]({coords['south']},{coords['west']},{coords['north']},{coords['east']});
          way["amenity"="{request.amenity_type}"]({coords['south']},{coords['west']},{coords['north']},{coords['east']});
        );
        out body;
        """
        
        result = api.query(query)
        
        # Process POI data
        pois = []
        discount_offers = [
            "10% off your next meal",
            "Free coffee with any pastry",
            "Happy Hour: 20% off drinks",
            "Buy 2 get 1 free",
            "Student discount: 15% off",
            "Weekend special: Free dessert"
        ]
        
        for i, node in enumerate(result.nodes[:20]):  # Limit to 20 POIs
            poi = {
                "id": str(node.id),
                "name": node.tags.get("name", f"Local {request.amenity_type.title()}"),
                "amenity_type": node.tags.get("amenity"),
                "coordinates": [float(node.lon), float(node.lat)],
                "cuisine": node.tags.get("cuisine", ""),
                "opening_hours": node.tags.get("opening_hours", ""),
                "phone": node.tags.get("phone", ""),
                "website": node.tags.get("website", ""),
                "discount_offer": discount_offers[i % len(discount_offers)],
                "coins_required": (i % 3 + 1) * 5  # 5, 10, or 15 coins
            }
            pois.append(poi)
        
        # Cache the results
        await cache_pois(city, request.amenity_type, pois)
        
        return {"success": True, "data": pois, "count": len(pois), "source": "api"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"POI error: {str(e)}")

@api_router.get("/poi/cities")
async def get_supported_cities():
    return {
        "cities": list(CITY_COORDS.keys()),
        "amenity_types": ["restaurant", "cafe", "bar", "fast_food", "pub"],
        "city_centers": {city: coords["center"] for city, coords in CITY_COORDS.items()}
    }

# Walk endpoints
@api_router.post("/walks", response_model=Walk)
async def create_walk(walk_data: WalkCreate):
    # Calculate coins earned
    coins_earned = calculate_coins(walk_data.distance_km)
    
    # Create walk record
    walk = Walk(**walk_data.dict(), coins_earned=coins_earned)
    await db.walks.insert_one(walk.dict())
    
    # Update user's coins and total distance
    await db.users.update_one(
        {"id": walk_data.user_id},
        {
            "$inc": {
                "walk_coins": coins_earned,
                "total_distance_km": walk_data.distance_km
            }
        }
    )
    
    return walk

@api_router.get("/walks/user/{user_id}", response_model=List[Walk])
async def get_user_walks(user_id: str):
    walks = await db.walks.find({"user_id": user_id}).sort("created_at", -1).to_list(100)
    return [Walk(**walk) for walk in walks]

@api_router.get("/walks/leaderboard")
async def get_leaderboard():
    users = await db.users.find().sort("total_distance_km", -1).limit(10).to_list(10)
    return [
        {
            "name": user["name"],
            "total_distance_km": user["total_distance_km"],
            "walk_coins": user["walk_coins"]
        }
        for user in users
    ]

# Geocoding endpoint
@api_router.get("/geocode")
async def geocode_address(address: str):
    try:
        geolocator = Nominatim(user_agent="gowalking-app")
        location = geolocator.geocode(f"{address}, Germany")
        
        if location:
            return {
                "success": True,
                "coordinates": [location.longitude, location.latitude],
                "display_name": location.address
            }
        else:
            raise HTTPException(status_code=404, detail="Address not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding error: {str(e)}")

# Friend Management Endpoints
@api_router.post("/friends/request", response_model=FriendRequest)
async def send_friend_request(request: FriendRequestCreate, current_user_id: str = None):
    if not current_user_id:
        raise HTTPException(status_code=400, detail="current_user_id is required")
        
    # Find receiver by email
    receiver = await db.users.find_one({"email": request.receiver_email})
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get sender info
    sender = await db.users.find_one({"id": current_user_id})
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")
    
    if sender["id"] == receiver["id"]:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")
    
    # Check if already friends or request exists
    existing_friendship = await db.friendships.find_one({
        "$or": [
            {"user1_id": sender["id"], "user2_id": receiver["id"]},
            {"user1_id": receiver["id"], "user2_id": sender["id"]}
        ]
    })
    if existing_friendship:
        raise HTTPException(status_code=400, detail="Already friends")
    
    existing_request = await db.friend_requests.find_one({
        "sender_id": sender["id"], 
        "receiver_id": receiver["id"],
        "status": "pending"
    })
    if existing_request:
        raise HTTPException(status_code=400, detail="Friend request already sent")
    
    # Create friend request
    friend_request = FriendRequest(
        sender_id=sender["id"],
        receiver_id=receiver["id"],
        sender_name=sender["name"],
        receiver_name=receiver["name"]
    )
    
    await db.friend_requests.insert_one(friend_request.dict())
    return friend_request

@api_router.get("/friends/requests/{user_id}")
async def get_friend_requests(user_id: str):
    # Get pending requests received by this user
    received_requests = await db.friend_requests.find({
        "receiver_id": user_id,
        "status": "pending"
    }).to_list(100)
    
    # Get pending requests sent by this user
    sent_requests = await db.friend_requests.find({
        "sender_id": user_id,
        "status": "pending"
    }).to_list(100)
    
    return {
        "received": [FriendRequest(**req) for req in received_requests],
        "sent": [FriendRequest(**req) for req in sent_requests]
    }

@api_router.post("/friends/respond/{request_id}")
async def respond_to_friend_request(request_id: str, action: str):
    if action not in ["accept", "decline"]:
        raise HTTPException(status_code=400, detail="Action must be 'accept' or 'decline'")
    
    # Find the request
    friend_request = await db.friend_requests.find_one({"id": request_id})
    if not friend_request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    
    if friend_request["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    
    # Update request status
    await db.friend_requests.update_one(
        {"id": request_id},
        {"$set": {"status": action + "ed"}}
    )
    
    # If accepted, create friendship
    if action == "accept":
        friendship = Friendship(
            user1_id=friend_request["sender_id"],
            user2_id=friend_request["receiver_id"],
            user1_name=friend_request["sender_name"],
            user2_name=friend_request["receiver_name"]
        )
        await db.friendships.insert_one(friendship.dict())
    
    return {"success": True, "action": action}

@api_router.get("/friends/{user_id}")
async def get_friends(user_id: str):
    friendships = await db.friendships.find({
        "$or": [
            {"user1_id": user_id},
            {"user2_id": user_id}
        ]
    }).to_list(100)
    
    friends = []
    for friendship in friendships:
        if friendship["user1_id"] == user_id:
            friend_info = {
                "id": friendship["user2_id"],
                "name": friendship["user2_name"],
                "friendship_id": friendship["id"]
            }
        else:
            friend_info = {
                "id": friendship["user1_id"],
                "name": friendship["user1_name"],
                "friendship_id": friendship["id"]
            }
        
        # Get friend's latest stats
        friend_data = await db.users.find_one({"id": friend_info["id"]})
        if friend_data:
            friend_info.update({
                "walk_coins": friend_data["walk_coins"],
                "total_distance_km": friend_data["total_distance_km"]
            })
        
        friends.append(friend_info)
    
    return friends

# Walk Invitation Endpoints
@api_router.post("/walk-invitations", response_model=WalkInvitation)
async def send_walk_invitation(invitation_data: WalkInvitationCreate, sender_id: str = None):
    if not sender_id:
        raise HTTPException(status_code=400, detail="sender_id is required")
        
    # Get sender and receiver info
    sender = await db.users.find_one({"id": sender_id})
    receiver = await db.users.find_one({"id": invitation_data.receiver_id})
    
    if not sender or not receiver:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if they are friends
    friendship = await db.friendships.find_one({
        "$or": [
            {"user1_id": sender_id, "user2_id": invitation_data.receiver_id},
            {"user1_id": invitation_data.receiver_id, "user2_id": sender_id}
        ]
    })
    if not friendship:
        raise HTTPException(status_code=400, detail="Can only invite friends to walk")
    
    invitation = WalkInvitation(
        sender_id=sender_id,
        receiver_id=invitation_data.receiver_id,
        sender_name=sender["name"],
        receiver_name=receiver["name"],
        **invitation_data.dict(exclude={"receiver_id"})
    )
    
    await db.walk_invitations.insert_one(invitation.dict())
    return invitation

@api_router.get("/walk-invitations/{user_id}")
async def get_walk_invitations(user_id: str):
    # Get invitations received
    received = await db.walk_invitations.find({
        "receiver_id": user_id,
        "status": "pending"
    }).sort("created_at", -1).to_list(50)
    
    # Get invitations sent
    sent = await db.walk_invitations.find({
        "sender_id": user_id,
        "status": "pending"
    }).sort("created_at", -1).to_list(50)
    
    return {
        "received": [WalkInvitation(**inv) for inv in received],
        "sent": [WalkInvitation(**inv) for inv in sent]
    }

@api_router.post("/walk-invitations/respond/{invitation_id}")
async def respond_to_walk_invitation(invitation_id: str, action: str):
    if action not in ["accept", "decline"]:
        raise HTTPException(status_code=400, detail="Action must be 'accept' or 'decline'")
    
    # Find invitation
    invitation = await db.walk_invitations.find_one({"id": invitation_id})
    if not invitation:
        raise HTTPException(status_code=404, detail="Walk invitation not found")
    
    if invitation["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invitation already processed")
    
    # Update invitation status
    new_status = "accepted" if action == "accept" else "declined"
    await db.walk_invitations.update_one(
        {"id": invitation_id},
        {"$set": {"status": new_status}}
    )
    
    return {"success": True, "action": action, "invitation": invitation}

@api_router.get("/friends/activity/{user_id}")
async def get_friends_activity(user_id: str):
    # Get user's friends
    friends = await get_friends(user_id)
    friend_ids = [friend["id"] for friend in friends]
    
    # Get recent walks by friends
    recent_walks = await db.walks.find({
        "user_id": {"$in": friend_ids}
    }).sort("created_at", -1).limit(20).to_list(20)
    
    # Format activity feed
    activity = []
    for walk in recent_walks:
        friend_name = next((f["name"] for f in friends if f["id"] == walk["user_id"]), "Unknown")
        activity.append({
            "type": "walk_completed",
            "friend_name": friend_name,
            "friend_id": walk["user_id"],
            "route_name": walk["route_name"],
            "distance_km": walk["distance_km"],
            "coins_earned": walk["coins_earned"],
            "city": walk["city"],
            "created_at": walk["created_at"]
        })
    
    return activity

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()