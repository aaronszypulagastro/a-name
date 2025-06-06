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
from datetime import datetime, timedelta
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
    new_achievements: Optional[List[dict]] = None

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

class Achievement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    category: str  # distance, social, explorer, streak, business
    tier: str      # bronze, silver, gold, platinum
    icon: str      # emoji or icon identifier
    criteria: dict # criteria for earning the achievement
    points: int    # achievement points value
    is_hidden: bool = False  # hidden until unlocked

class UserAchievement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    achievement_id: str
    achievement_name: str
    achievement_description: str
    achievement_icon: str
    achievement_tier: str
    achievement_category: str
    achievement_points: int
    progress: float = 100.0  # percentage progress (100 = completed)
    earned_at: datetime = Field(default_factory=datetime.utcnow)
    is_new: bool = True  # for showing "NEW!" badge

class AchievementProgress(BaseModel):
    achievement_id: str
    achievement_name: str
    description: str
    category: str
    tier: str
    icon: str
    points: int
    current_progress: float
    target_value: float
    current_value: float
    progress_percentage: float
    is_completed: bool

class WalkingGroup(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    city: str
    creator_id: str
    creator_name: str
    is_public: bool = True
    max_members: int = 50
    member_count: int = 1
    total_distance_km: float = 0.0
    total_walks: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WalkingGroupCreate(BaseModel):
    name: str
    description: str
    city: str
    is_public: bool = True
    max_members: int = 50

class GroupMembership(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    user_id: str
    user_name: str
    role: str = "member"  # member, admin, creator
    joined_at: datetime = Field(default_factory=datetime.utcnow)

class Challenge(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    challenge_type: str  # distance, walks_count, streak, time_based
    target_value: float
    unit: str  # km, walks, days, minutes
    duration_days: int
    creator_id: str
    creator_name: str
    participants: List[str] = []
    is_public: bool = True
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: datetime
    status: str = "active"  # active, completed, cancelled
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChallengeCreate(BaseModel):
    title: str
    description: str
    challenge_type: str
    target_value: float
    unit: str
    duration_days: int
    is_public: bool = True

class ChallengeParticipation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    challenge_id: str
    user_id: str
    user_name: str
    current_progress: float = 0.0
    is_completed: bool = False
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class SocialPost(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    post_type: str  # walk_completed, achievement_earned, challenge_completed, general
    content: str
    walk_id: Optional[str] = None
    achievement_id: Optional[str] = None
    challenge_id: Optional[str] = None
    image_url: Optional[str] = None
    likes_count: int = 0
    comments_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SocialPostCreate(BaseModel):
    post_type: str
    content: str
    walk_id: Optional[str] = None
    achievement_id: Optional[str] = None
    challenge_id: Optional[str] = None
    image_url: Optional[str] = None

class PostLike(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    post_id: str
    user_id: str
    user_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PostComment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    post_id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PostCommentCreate(BaseModel):
    content: str

class GroupEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    title: str
    description: str
    event_date: datetime
    meeting_point: str
    route_start: List[float]  # [lng, lat]
    route_end: List[float]    # [lng, lat]
    estimated_distance_km: float
    max_participants: int = 20
    participants: List[str] = []
    creator_id: str
    creator_name: str
    status: str = "upcoming"  # upcoming, active, completed, cancelled
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GroupEventCreate(BaseModel):
    title: str
    description: str
    event_date: datetime
    meeting_point: str
    route_start: List[float]
    route_end: List[float]
    estimated_distance_km: float
    max_participants: int = 20

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

# Achievement definitions
ACHIEVEMENTS = [
    # Distance Achievements
    {
        "id": "first_steps",
        "name": "First Steps",
        "description": "Complete your first walk",
        "category": "distance",
        "tier": "bronze",
        "icon": "👶",
        "criteria": {"walks_completed": 1},
        "points": 10
    },
    {
        "id": "kilometer_king",
        "name": "Kilometer King",
        "description": "Walk a total of 10 kilometers",
        "category": "distance",
        "tier": "bronze",
        "icon": "🚶",
        "criteria": {"total_distance_km": 10},
        "points": 25
    },
    {
        "id": "distance_champion",
        "name": "Distance Champion",
        "description": "Walk a total of 50 kilometers",
        "category": "distance",
        "tier": "silver",
        "icon": "🏃‍♂️",
        "criteria": {"total_distance_km": 50},
        "points": 100
    },
    {
        "id": "marathon_walker",
        "name": "Marathon Walker",
        "description": "Walk a total of 100 kilometers",
        "category": "distance",
        "tier": "gold",
        "icon": "🏆",
        "criteria": {"total_distance_km": 100},
        "points": 250
    },
    {
        "id": "ultra_walker",
        "name": "Ultra Walker",
        "description": "Walk a total of 500 kilometers",
        "category": "distance",
        "tier": "platinum",
        "icon": "💎",
        "criteria": {"total_distance_km": 500},
        "points": 1000
    },
    
    # Explorer Achievements
    {
        "id": "city_explorer",
        "name": "City Explorer",
        "description": "Walk in 2 different cities",
        "category": "explorer",
        "tier": "bronze",
        "icon": "🏙️",
        "criteria": {"cities_visited": 2},
        "points": 30
    },
    {
        "id": "multi_city_walker",
        "name": "Multi-City Walker",
        "description": "Walk in all 3 supported cities",
        "category": "explorer",
        "tier": "silver",
        "icon": "🗺️",
        "criteria": {"cities_visited": 3},
        "points": 75
    },
    {
        "id": "local_expert",
        "name": "Local Expert",
        "description": "Complete 20 walks in the same city",
        "category": "explorer",
        "tier": "gold",
        "icon": "🧭",
        "criteria": {"walks_in_single_city": 20},
        "points": 150
    },
    
    # Social Achievements
    {
        "id": "friendship_builder",
        "name": "Friendship Builder",
        "description": "Add your first friend",
        "category": "social",
        "tier": "bronze",
        "icon": "👥",
        "criteria": {"friends_count": 1},
        "points": 20
    },
    {
        "id": "social_butterfly",
        "name": "Social Butterfly",
        "description": "Have 5 friends on GoWalking",
        "category": "social",
        "tier": "silver",
        "icon": "🦋",
        "criteria": {"friends_count": 5},
        "points": 75
    },
    {
        "id": "walk_organizer",
        "name": "Walk Organizer",
        "description": "Send 10 walk invitations",
        "category": "social",
        "tier": "gold",
        "icon": "📝",
        "criteria": {"walk_invitations_sent": 10},
        "points": 100
    },
    
    # Business Achievements
    {
        "id": "local_supporter",
        "name": "Local Supporter",
        "description": "Visit 5 local businesses",
        "category": "business",
        "tier": "bronze",
        "icon": "🏪",
        "criteria": {"businesses_visited": 5},
        "points": 30
    },
    {
        "id": "discount_hunter",
        "name": "Discount Hunter",
        "description": "Redeem 3 business offers",
        "category": "business",
        "tier": "silver",
        "icon": "🎯",
        "criteria": {"offers_redeemed": 3},
        "points": 50
    },
    
    # Streak Achievements
    {
        "id": "consistency_king",
        "name": "Consistency King",
        "description": "Walk for 3 consecutive days",
        "category": "streak",
        "tier": "bronze",
        "icon": "🔥",
        "criteria": {"consecutive_days": 3},
        "points": 40
    },
    {
        "id": "weekly_warrior",
        "name": "Weekly Warrior",
        "description": "Walk for 7 consecutive days",
        "category": "streak",
        "tier": "silver",
        "icon": "⚡",
        "criteria": {"consecutive_days": 7},
        "points": 100
    },
    {
        "id": "daily_devotee",
        "name": "Daily Devotee",
        "description": "Walk for 30 consecutive days",
        "category": "streak",
        "tier": "gold",
        "icon": "🏅",
        "criteria": {"consecutive_days": 30},
        "points": 300
    },
    
    # Coin Achievements
    {
        "id": "coin_collector",
        "name": "Coin Collector",
        "description": "Earn 100 WalkCoins",
        "category": "coins",
        "tier": "bronze",
        "icon": "🪙",
        "criteria": {"total_coins_earned": 100},
        "points": 25
    },
    {
        "id": "treasure_hunter",
        "name": "Treasure Hunter",
        "description": "Earn 500 WalkCoins",
        "category": "coins",
        "tier": "silver",
        "icon": "💰",
        "criteria": {"total_coins_earned": 500},
        "points": 100
    },
    {
        "id": "coin_master",
        "name": "Coin Master",
        "description": "Earn 1000 WalkCoins",
        "category": "coins",
        "tier": "gold",
        "icon": "👑",
        "criteria": {"total_coins_earned": 1000},
        "points": 250
    }
]

async def initialize_achievements():
    """Initialize achievements in database if they don't exist"""
    for achievement_data in ACHIEVEMENTS:
        existing = await db.achievements.find_one({"id": achievement_data["id"]})
        if not existing:
            achievement = Achievement(**achievement_data)
            await db.achievements.insert_one(achievement.dict())

async def check_and_award_achievements(user_id: str):
    """Check if user has earned any new achievements"""
    # Get user stats
    user = await db.users.find_one({"id": user_id})
    if not user:
        return []
    
    # Get user's walks for additional stats
    walks = await db.walks.find({"user_id": user_id}).to_list(1000)
    friends = await db.friendships.find({
        "$or": [{"user1_id": user_id}, {"user2_id": user_id}]
    }).to_list(1000)
    walk_invitations = await db.walk_invitations.find({"sender_id": user_id}).to_list(1000)
    
    # Calculate stats
    stats = {
        "walks_completed": len(walks),
        "total_distance_km": user.get("total_distance_km", 0),
        "cities_visited": len(set(walk["city"] for walk in walks)),
        "friends_count": len(friends),
        "walk_invitations_sent": len(walk_invitations),
        "total_coins_earned": user.get("walk_coins", 0),
        "businesses_visited": 0,  # TODO: implement business visit tracking
        "offers_redeemed": 0,     # TODO: implement offer redemption tracking
        "consecutive_days": 0,    # TODO: implement streak calculation
    }
    
    # Calculate walks in single city
    city_counts = {}
    for walk in walks:
        city = walk["city"]
        city_counts[city] = city_counts.get(city, 0) + 1
    stats["walks_in_single_city"] = max(city_counts.values()) if city_counts else 0
    
    # Get existing user achievements
    existing_achievements = await db.user_achievements.find({"user_id": user_id}).to_list(1000)
    existing_achievement_ids = {ach["achievement_id"] for ach in existing_achievements}
    
    new_achievements = []
    
    # Check each achievement
    for achievement_data in ACHIEVEMENTS:
        achievement_id = achievement_data["id"]
        
        # Skip if already earned
        if achievement_id in existing_achievement_ids:
            continue
        
        # Check if criteria is met
        criteria_met = True
        for criteria_key, criteria_value in achievement_data["criteria"].items():
            if stats.get(criteria_key, 0) < criteria_value:
                criteria_met = False
                break
        
        if criteria_met:
            # Award achievement
            user_achievement = UserAchievement(
                user_id=user_id,
                achievement_id=achievement_id,
                achievement_name=achievement_data["name"],
                achievement_description=achievement_data["description"],
                achievement_icon=achievement_data["icon"],
                achievement_tier=achievement_data["tier"],
                achievement_category=achievement_data["category"],
                achievement_points=achievement_data["points"]
            )
            
            await db.user_achievements.insert_one(user_achievement.dict())
            new_achievements.append(user_achievement)
    
    return new_achievements

async def get_achievement_progress(user_id: str):
    """Get user's progress toward all achievements"""
    # Get user stats (same calculation as above)
    user = await db.users.find_one({"id": user_id})
    if not user:
        return []
    
    walks = await db.walks.find({"user_id": user_id}).to_list(1000)
    friends = await db.friendships.find({
        "$or": [{"user1_id": user_id}, {"user2_id": user_id}]
    }).to_list(1000)
    walk_invitations = await db.walk_invitations.find({"sender_id": user_id}).to_list(1000)
    
    stats = {
        "walks_completed": len(walks),
        "total_distance_km": user.get("total_distance_km", 0),
        "cities_visited": len(set(walk["city"] for walk in walks)),
        "friends_count": len(friends),
        "walk_invitations_sent": len(walk_invitations),
        "total_coins_earned": user.get("walk_coins", 0),
        "businesses_visited": 0,
        "offers_redeemed": 0,
        "consecutive_days": 0,
    }
    
    city_counts = {}
    for walk in walks:
        city = walk["city"]
        city_counts[city] = city_counts.get(city, 0) + 1
    stats["walks_in_single_city"] = max(city_counts.values()) if city_counts else 0
    
    # Get completed achievements
    completed_achievements = await db.user_achievements.find({"user_id": user_id}).to_list(1000)
    completed_ids = {ach["achievement_id"] for ach in completed_achievements}
    
    progress_list = []
    
    for achievement_data in ACHIEVEMENTS:
        achievement_id = achievement_data["id"]
        is_completed = achievement_id in completed_ids
        
        if is_completed:
            progress = AchievementProgress(
                achievement_id=achievement_id,
                achievement_name=achievement_data["name"],
                description=achievement_data["description"],
                category=achievement_data["category"],
                tier=achievement_data["tier"],
                icon=achievement_data["icon"],
                points=achievement_data["points"],
                current_progress=100.0,
                target_value=0,
                current_value=0,
                progress_percentage=100.0,
                is_completed=True
            )
        else:
            # Calculate progress for incomplete achievements
            criteria = achievement_data["criteria"]
            criteria_key = list(criteria.keys())[0]  # Assuming single criteria per achievement
            target_value = criteria[criteria_key]
            current_value = stats.get(criteria_key, 0)
            progress_percentage = min((current_value / target_value) * 100, 100) if target_value > 0 else 0
            
            progress = AchievementProgress(
                achievement_id=achievement_id,
                achievement_name=achievement_data["name"],
                description=achievement_data["description"],
                category=achievement_data["category"],
                tier=achievement_data["tier"],
                icon=achievement_data["icon"],
                points=achievement_data["points"],
                current_progress=progress_percentage,
                target_value=target_value,
                current_value=current_value,
                progress_percentage=progress_percentage,
                is_completed=False
            )
        
        progress_list.append(progress)
    
    return progress_list

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
    
    # Check for new achievements
    try:
        new_achievements = await check_and_award_achievements(walk_data.user_id)
        if new_achievements:
            walk.new_achievements = [ach.dict() for ach in new_achievements]
    except Exception as e:
        print(f"Error checking achievements: {e}")
    
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
async def send_friend_request(request: FriendRequestCreate, current_user_id: str = Query(...)):
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
async def send_walk_invitation(invitation_data: WalkInvitationCreate, sender_id: str = Query(...)):
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
async def respond_to_walk_invitation(invitation_id: str, action: str = Query(...)):
    if action not in ["accept", "decline"]:
        raise HTTPException(status_code=400, detail="Action must be 'accept' or 'decline'")
    
    # Find invitation
    invitation_doc = await db.walk_invitations.find_one({"id": invitation_id})
    if not invitation_doc:
        raise HTTPException(status_code=404, detail="Walk invitation not found")
    
    if invitation_doc["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invitation already processed")
    
    # Update invitation status
    new_status = "accepted" if action == "accept" else "declined"
    await db.walk_invitations.update_one(
        {"id": invitation_id},
        {"$set": {"status": new_status}}
    )
    
    # Convert MongoDB document to regular dict for JSON serialization
    invitation_dict = {}
    for key, value in invitation_doc.items():
        if key != "_id":  # Skip MongoDB ObjectId
            invitation_dict[key] = value
    
    return {"success": True, "action": action, "invitation": invitation_dict}

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

# Achievement Endpoints
@api_router.get("/achievements/initialize")
async def initialize_achievements_endpoint():
    """Initialize achievements in database"""
    await initialize_achievements()
    return {"success": True, "message": "Achievements initialized"}

@api_router.get("/achievements")
async def get_all_achievements():
    """Get all available achievements"""
    achievements = await db.achievements.find().to_list(1000)
    return [Achievement(**ach) for ach in achievements]

@api_router.get("/achievements/user/{user_id}")
async def get_user_achievements(user_id: str):
    """Get user's earned achievements"""
    user_achievements = await db.user_achievements.find({"user_id": user_id}).sort("earned_at", -1).to_list(1000)
    return [UserAchievement(**ach) for ach in user_achievements]

@api_router.get("/achievements/progress/{user_id}")
async def get_user_achievement_progress(user_id: str):
    """Get user's progress toward all achievements"""
    progress = await get_achievement_progress(user_id)
    return progress

@api_router.post("/achievements/check/{user_id}")
async def check_user_achievements(user_id: str):
    """Check and award any new achievements for user"""
    new_achievements = await check_and_award_achievements(user_id)
    return {
        "success": True,
        "new_achievements": [UserAchievement(**ach.dict()) for ach in new_achievements],
        "count": len(new_achievements)
    }

@api_router.post("/achievements/mark-seen/{user_id}")
async def mark_achievements_seen(user_id: str, achievement_ids: List[str]):
    """Mark achievements as seen (remove 'NEW!' badge)"""
    await db.user_achievements.update_many(
        {"user_id": user_id, "achievement_id": {"$in": achievement_ids}},
        {"$set": {"is_new": False}}
    )
    return {"success": True}

@api_router.get("/achievements/stats/{user_id}")
async def get_achievement_stats(user_id: str):
    """Get user's achievement statistics"""
    user_achievements = await db.user_achievements.find({"user_id": user_id}).to_list(1000)
    
    # Calculate stats
    total_achievements = len(user_achievements)
    total_points = sum(ach["achievement_points"] for ach in user_achievements)
    
    # Count by tier
    tier_counts = {"bronze": 0, "silver": 0, "gold": 0, "platinum": 0}
    category_counts = {"distance": 0, "social": 0, "explorer": 0, "streak": 0, "business": 0, "coins": 0}
    
    for ach in user_achievements:
        tier = ach.get("achievement_tier", "bronze")
        category = ach.get("achievement_category", "other")
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        category_counts[category] = category_counts.get(category, 0) + 1
    
    completion_percentage = (total_achievements / len(ACHIEVEMENTS)) * 100 if ACHIEVEMENTS else 0
    
    return {
        "total_achievements": total_achievements,
        "total_points": total_points,
        "completion_percentage": round(completion_percentage, 1),
        "tier_counts": tier_counts,
        "category_counts": category_counts,
        "available_achievements": len(ACHIEVEMENTS)
    }

# Enhanced Social Features Endpoints

# Walking Groups
@api_router.post("/groups", response_model=WalkingGroup)
async def create_walking_group(group_data: WalkingGroupCreate, creator_id: str = Query(...)):
    # Get creator info
    creator = await db.users.find_one({"id": creator_id})
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    
    # Create group
    group = WalkingGroup(
        creator_id=creator_id,
        creator_name=creator["name"],
        **group_data.dict()
    )
    
    await db.walking_groups.insert_one(group.dict())
    
    # Add creator as member
    membership = GroupMembership(
        group_id=group.id,
        user_id=creator_id,
        user_name=creator["name"],
        role="creator"
    )
    await db.group_memberships.insert_one(membership.dict())
    
    return group

@api_router.get("/groups")
async def get_walking_groups(city: str = None, limit: int = 20):
    query = {}
    if city:
        query["city"] = city
    query["is_public"] = True
    
    groups = await db.walking_groups.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [WalkingGroup(**group) for group in groups]

@api_router.get("/groups/{group_id}")
async def get_walking_group(group_id: str):
    group = await db.walking_groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get members
    memberships = await db.group_memberships.find({"group_id": group_id}).to_list(100)
    
    # Convert to proper format
    group_dict = {}
    for key, value in group.items():
        if key != "_id":  # Skip MongoDB ObjectId
            group_dict[key] = value
    
    group_dict["members"] = []
    for membership in memberships:
        member_dict = {}
        for key, value in membership.items():
            if key != "_id":
                member_dict[key] = value
        group_dict["members"].append(member_dict)
    
    return group_dict

@api_router.post("/groups/{group_id}/join")
async def join_walking_group(group_id: str, user_id: str = Query(...)):
    # Check if group exists
    group = await db.walking_groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if already a member
    existing = await db.group_memberships.find_one({"group_id": group_id, "user_id": user_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already a member")
    
    # Check group capacity
    if group["member_count"] >= group["max_members"]:
        raise HTTPException(status_code=400, detail="Group is full")
    
    # Get user info
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Add membership
    membership = GroupMembership(
        group_id=group_id,
        user_id=user_id,
        user_name=user["name"]
    )
    await db.group_memberships.insert_one(membership.dict())
    
    # Update group member count
    await db.walking_groups.update_one(
        {"id": group_id},
        {"$inc": {"member_count": 1}}
    )
    
    return {"success": True, "message": "Joined group successfully"}

@api_router.get("/groups/user/{user_id}")
async def get_user_groups(user_id: str):
    memberships = await db.group_memberships.find({"user_id": user_id}).to_list(100)
    group_ids = [membership["group_id"] for membership in memberships]
    
    if not group_ids:
        return []
    
    groups = await db.walking_groups.find({"id": {"$in": group_ids}}).to_list(100)
    return [WalkingGroup(**group) for group in groups]

# Challenges
@api_router.post("/challenges", response_model=Challenge)
async def create_challenge(challenge_data: ChallengeCreate, creator_id: str = Query(...)):
    # Get creator info
    creator = await db.users.find_one({"id": creator_id})
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    
    # Calculate end date
    start_date = datetime.utcnow()
    end_date = start_date + timedelta(days=challenge_data.duration_days)
    
    challenge = Challenge(
        creator_id=creator_id,
        creator_name=creator["name"],
        participants=[creator_id],
        start_date=start_date,
        end_date=end_date,
        **challenge_data.dict()
    )
    
    await db.challenges.insert_one(challenge.dict())
    
    # Add creator as participant
    participation = ChallengeParticipation(
        challenge_id=challenge.id,
        user_id=creator_id,
        user_name=creator["name"]
    )
    await db.challenge_participations.insert_one(participation.dict())
    
    return challenge

@api_router.get("/challenges")
async def get_challenges(status: str = "active", limit: int = 20):
    query = {"status": status, "is_public": True}
    challenges = await db.challenges.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [Challenge(**challenge) for challenge in challenges]

@api_router.post("/challenges/{challenge_id}/join")
async def join_challenge(challenge_id: str, user_id: str = Query(...)):
    # Check if challenge exists and is active
    challenge = await db.challenges.find_one({"id": challenge_id})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    
    if challenge["status"] != "active":
        raise HTTPException(status_code=400, detail="Challenge is not active")
    
    # Check if already participating
    existing = await db.challenge_participations.find_one({"challenge_id": challenge_id, "user_id": user_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already participating")
    
    # Get user info
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Add participation
    participation = ChallengeParticipation(
        challenge_id=challenge_id,
        user_id=user_id,
        user_name=user["name"]
    )
    await db.challenge_participations.insert_one(participation.dict())
    
    # Update challenge participants
    await db.challenges.update_one(
        {"id": challenge_id},
        {"$push": {"participants": user_id}}
    )
    
    return {"success": True, "message": "Joined challenge successfully"}

@api_router.get("/challenges/{challenge_id}/leaderboard")
async def get_challenge_leaderboard(challenge_id: str):
    participations = await db.challenge_participations.find(
        {"challenge_id": challenge_id}
    ).sort("current_progress", -1).to_list(100)
    
    return [ChallengeParticipation(**participation) for participation in participations]

# Social Feed
@api_router.post("/social/posts", response_model=SocialPost)
async def create_social_post(post_data: SocialPostCreate, user_id: str = Query(...)):
    # Get user info
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    post = SocialPost(
        user_id=user_id,
        user_name=user["name"],
        **post_data.dict()
    )
    
    await db.social_posts.insert_one(post.dict())
    return post

@api_router.get("/social/feed/{user_id}")
async def get_social_feed(user_id: str, limit: int = 20):
    # Get user's friends for personalized feed
    friends = await get_friends(user_id)
    friend_ids = [friend["id"] for friend in friends] + [user_id]  # Include user's own posts
    
    # Get posts from friends and user
    posts = await db.social_posts.find(
        {"user_id": {"$in": friend_ids}}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return [SocialPost(**post) for post in posts]

@api_router.get("/social/posts/public")
async def get_public_feed(limit: int = 20):
    posts = await db.social_posts.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [SocialPost(**post) for post in posts]

@api_router.post("/social/posts/{post_id}/like")
async def like_post(post_id: str, user_id: str = Query(...)):
    # Check if already liked
    existing = await db.post_likes.find_one({"post_id": post_id, "user_id": user_id})
    if existing:
        # Unlike
        await db.post_likes.delete_one({"post_id": post_id, "user_id": user_id})
        await db.social_posts.update_one({"id": post_id}, {"$inc": {"likes_count": -1}})
        return {"success": True, "action": "unliked"}
    else:
        # Like
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        like = PostLike(
            post_id=post_id,
            user_id=user_id,
            user_name=user["name"]
        )
        await db.post_likes.insert_one(like.dict())
        await db.social_posts.update_one({"id": post_id}, {"$inc": {"likes_count": 1}})
        return {"success": True, "action": "liked"}

@api_router.post("/social/posts/{post_id}/comment", response_model=PostComment)
async def add_comment(post_id: str, comment_data: PostCommentCreate, user_id: str = Query(...)):
    # Get user info
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    comment = PostComment(
        post_id=post_id,
        user_id=user_id,
        user_name=user["name"],
        content=comment_data.content
    )
    
    await db.post_comments.insert_one(comment.dict())
    await db.social_posts.update_one({"id": post_id}, {"$inc": {"comments_count": 1}})
    
    return comment

@api_router.get("/social/posts/{post_id}/comments")
async def get_post_comments(post_id: str):
    comments = await db.post_comments.find({"post_id": post_id}).sort("created_at", 1).to_list(100)
    return [PostComment(**comment) for comment in comments]

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