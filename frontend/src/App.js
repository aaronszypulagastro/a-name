import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const businessIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Route Line Component
const RouteLine = ({ route }) => {
  const map = useMap();

  useEffect(() => {
    if (!route || !route.route_geometry) return;

    console.log('Drawing route with geometry:', route.route_geometry);

    let coordinates;
    
    // Handle different geometry formats
    if (Array.isArray(route.route_geometry[0]) && route.route_geometry[0].length === 2) {
      // Format: [[lng, lat], [lng, lat]] - convert to [lat, lng]
      coordinates = route.route_geometry.map(coord => [coord[1], coord[0]]);
    } else {
      // Already in [lat, lng] format
      coordinates = route.route_geometry;
    }

    console.log('Converted coordinates:', coordinates);

    const polyline = L.polyline(coordinates, { 
      color: '#2563eb', 
      weight: 4, 
      opacity: 0.7 
    });

    polyline.addTo(map);
    
    // Fit map to route bounds with some padding
    if (coordinates.length > 1) {
      map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
    }

    return () => {
      map.removeLayer(polyline);
    };
  }, [map, route]);

  return null;
};

// Main App Component
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedCity, setSelectedCity] = useState('regensburg');
  const [pois, setPois] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [isWalking, setIsWalking] = useState(false);
  const [walkStartTime, setWalkStartTime] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
  const [walkInvitations, setWalkInvitations] = useState({ received: [], sent: [] });
  const [friendsActivity, setFriendsActivity] = useState([]);
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [showInviteFriend, setShowInviteFriend] = useState(false);
  const [selectedFriendForInvite, setSelectedFriendForInvite] = useState(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const [userAchievements, setUserAchievements] = useState([]);
  const [achievementProgress, setAchievementProgress] = useState([]);
  const [achievementStats, setAchievementStats] = useState(null);
  const [newAchievementAlert, setNewAchievementAlert] = useState(null);

  const cityCenters = {
    regensburg: { lat: 49.03, lng: 12.12 },
    deggendorf: { lat: 48.84, lng: 12.96 },
    passau: { lat: 48.57, lng: 13.43 }
  };

  // Initialize user
  useEffect(() => {
    const initUser = async () => {
      try {
        // Check if user exists in localStorage
        const savedUser = localStorage.getItem('gowalking_user');
        if (savedUser) {
          const user = JSON.parse(savedUser);
          const response = await axios.get(`${API}/users/${user.id}`);
          setCurrentUser(response.data);
        } else {
          // Create new user
          const response = await axios.post(`${API}/users`, {
            name: `Walker${Math.floor(Math.random() * 1000)}`,
            email: `walker${Math.floor(Math.random() * 1000)}@gowalking.app`
          });
          setCurrentUser(response.data);
          localStorage.setItem('gowalking_user', JSON.stringify(response.data));
        }
      } catch (error) {
        console.error('Error initializing user:', error);
      }
    };

    initUser();
    fetchLeaderboard();
  }, []);

  // Fetch POIs
  const fetchPOIs = async (city, amenityType = 'restaurant') => {
    try {
      const response = await axios.post(`${API}/poi`, {
        city: city,
        amenity_type: amenityType
      });
      if (response.data.success) {
        setPois(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching POIs:', error);
    }
  };

  // Fetch leaderboard
  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`${API}/walks/leaderboard`);
      setLeaderboard(response.data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  // Friend management functions
  const fetchFriends = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/friends/${currentUser.id}`);
      setFriends(response.data);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const fetchFriendRequests = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/friends/requests/${currentUser.id}`);
      setFriendRequests(response.data);
    } catch (error) {
      console.error('Error fetching friend requests:', error);
    }
  };

  const fetchWalkInvitations = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/walk-invitations/${currentUser.id}`);
      setWalkInvitations(response.data);
    } catch (error) {
      console.error('Error fetching walk invitations:', error);
    }
  };

  const fetchFriendsActivity = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/friends/activity/${currentUser.id}`);
      setFriendsActivity(response.data);
    } catch (error) {
      console.error('Error fetching friends activity:', error);
    }
  };

  // Achievement functions
  const initializeAchievements = async () => {
    try {
      await axios.get(`${API}/achievements/initialize`);
    } catch (error) {
      console.error('Error initializing achievements:', error);
    }
  };

  const fetchUserAchievements = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/achievements/user/${currentUser.id}`);
      setUserAchievements(response.data);
    } catch (error) {
      console.error('Error fetching user achievements:', error);
    }
  };

  const fetchAchievementProgress = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/achievements/progress/${currentUser.id}`);
      setAchievementProgress(response.data);
    } catch (error) {
      console.error('Error fetching achievement progress:', error);
    }
  };

  const fetchAchievementStats = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/achievements/stats/${currentUser.id}`);
      setAchievementStats(response.data);
    } catch (error) {
      console.error('Error fetching achievement stats:', error);
    }
  };

  const checkForNewAchievements = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.post(`${API}/achievements/check/${currentUser.id}`);
      if (response.data.new_achievements && response.data.new_achievements.length > 0) {
        // Show achievement notification
        const achievement = response.data.new_achievements[0];
        setNewAchievementAlert(achievement);
        setTimeout(() => setNewAchievementAlert(null), 5000); // Hide after 5 seconds
        
        // Refresh achievement data
        fetchUserAchievements();
        fetchAchievementProgress();
        fetchAchievementStats();
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  };

  const sendFriendRequest = async () => {
    if (!newFriendEmail || !currentUser) {
      alert('Please enter an email address');
      return;
    }
    
    try {
      console.log('Sending friend request to:', newFriendEmail);
      const response = await axios.post(`${API}/friends/request?current_user_id=${currentUser.id}`, {
        receiver_email: newFriendEmail
      });
      
      console.log('Friend request response:', response.data);
      setNewFriendEmail('');
      fetchFriendRequests();
      alert('Friend request sent successfully!');
    } catch (error) {
      console.error('Friend request error:', error);
      const errorMessage = error.response?.data?.detail || 'Error sending friend request';
      alert(errorMessage);
    }
  };

  const respondToFriendRequest = async (requestId, action) => {
    try {
      await axios.post(`${API}/friends/respond/${requestId}?action=${action}`);
      fetchFriendRequests();
      fetchFriends();
      if (action === 'accept') {
        alert('Friend request accepted!');
      }
    } catch (error) {
      alert('Error responding to friend request');
    }
  };

  const inviteFriendToWalk = async (friendId) => {
    if (!currentRoute || !currentUser) {
      alert('Please plan a route first');
      return;
    }
    
    try {
      console.log('Inviting friend to walk:', friendId);
      const response = await axios.post(`${API}/walk-invitations?sender_id=${currentUser.id}`, {
        receiver_id: friendId,
        route_name: `Walk in ${selectedCity}`,
        start_point: [waypoints[0].lng, waypoints[0].lat],
        end_point: [waypoints[1].lng, waypoints[1].lat],
        city: selectedCity,
        distance_km: currentRoute.distance_km,
        message: `Come walk with me in ${selectedCity}!`
      });
      
      console.log('Walk invitation response:', response.data);
      setShowInviteFriend(false);
      fetchWalkInvitations();
      alert('Walk invitation sent successfully!');
    } catch (error) {
      console.error('Walk invitation error:', error);
      const errorMessage = error.response?.data?.detail || 'Error sending walk invitation';
      alert(errorMessage);
    }
  };

  const respondToWalkInvitation = async (invitationId, action) => {
    try {
      const response = await axios.post(`${API}/walk-invitations/respond/${invitationId}?action=${action}`);
      fetchWalkInvitations();
      
      if (action === 'accept') {
        const invitation = response.data.invitation;
        // Set up the route from the invitation
        setSelectedCity(invitation.city);
        setWaypoints([
          { lat: invitation.start_point[1], lng: invitation.start_point[0] },
          { lat: invitation.end_point[1], lng: invitation.end_point[0] }
        ]);
        calculateRoute(
          { lat: invitation.start_point[1], lng: invitation.start_point[0] },
          { lat: invitation.end_point[1], lng: invitation.end_point[0] }
        );
        alert(`Walk invitation accepted! Route loaded in ${invitation.city}`);
      }
    } catch (error) {
      alert('Error responding to walk invitation');
    }
  };

  useEffect(() => {
    fetchPOIs(selectedCity);
  }, [selectedCity]);

  useEffect(() => {
    if (currentUser) {
      fetchFriends();
      fetchFriendRequests();
      fetchWalkInvitations();
      fetchFriendsActivity();
      
      // Initialize and fetch achievements
      initializeAchievements();
      fetchUserAchievements();
      fetchAchievementProgress();
      fetchAchievementStats();
    }
  }, [currentUser]);

  // Handle map clicks for route planning
  const handleMapClick = (e) => {
    if (isWalking) {
      console.log('Cannot add waypoints while walking');
      return; // Don't allow route changes while walking
    }

    const newPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
    console.log('Adding waypoint:', newPoint);
    
    if (waypoints.length < 2) {
      const newWaypoints = [...waypoints, newPoint];
      console.log('New waypoints:', newWaypoints);
      setWaypoints(newWaypoints);
      
      if (newWaypoints.length === 2) {
        console.log('Two waypoints set, calculating route...');
        calculateRoute(newWaypoints[0], newWaypoints[1]);
      }
    } else {
      // Reset and start new route
      console.log('Resetting route, starting with new point');
      setWaypoints([newPoint]);
      setCurrentRoute(null);
    }
  };

  // Calculate route
  const calculateRoute = async (start, end) => {
    try {
      console.log('Calculating route from', start, 'to', end);
      const response = await axios.post(`${API}/route/calculate`, {
        start: [start.lng, start.lat],
        end: [end.lng, end.lat],
        city: selectedCity
      });
      
      console.log('Route response:', response.data);
      
      if (response.data.success) {
        setCurrentRoute(response.data);
        console.log('Route set successfully:', response.data);
      } else {
        console.error('Route calculation failed:', response.data);
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      console.error('Error response:', error.response?.data);
    }
  };

  // Start walking
  const startWalk = () => {
    if (!currentRoute) return;
    setIsWalking(true);
    setWalkStartTime(new Date());
  };

  // Finish walk
  const finishWalk = async () => {
    if (!currentRoute || !walkStartTime || !currentUser) return;

    const walkDuration = Math.floor((new Date() - walkStartTime) / 60000); // minutes
    
    try {
      console.log('Finishing walk...');
      const response = await axios.post(`${API}/walks`, {
        user_id: currentUser.id,
        route_name: `Walk in ${selectedCity}`,
        distance_km: currentRoute.distance_km,
        duration_minutes: walkDuration,
        start_point: [waypoints[0].lng, waypoints[0].lat],
        end_point: [waypoints[1].lng, waypoints[1].lat],
        city: selectedCity
      });

      console.log('Walk completed successfully:', response.data);

      // Update user data
      const updatedUser = await axios.get(`${API}/users/${currentUser.id}`);
      setCurrentUser(updatedUser.data);
      localStorage.setItem('gowalking_user', JSON.stringify(updatedUser.data));

      // Reset walk state
      setIsWalking(false);
      setWalkStartTime(null);
      setWaypoints([]);
      setCurrentRoute(null);
      
      // Refresh leaderboard and friends activity
      fetchLeaderboard();
      fetchFriendsActivity();

      alert(`🎉 Walk completed! You earned ${response.data.coins_earned} WalkCoins!`);
    } catch (error) {
      console.error('Error finishing walk:', error);
      alert('Error completing walk. Please try again.');
    }
  };

  const clearRoute = () => {
    setWaypoints([]);
    setCurrentRoute(null);
    setIsWalking(false);
    setWalkStartTime(null);
  };

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🚶‍♂️ GoWalking</h1>
            <p className="text-blue-100">Explore • Walk • Earn • Connect</p>
          </div>
          
          {currentUser && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-semibold">{currentUser.name}</div>
                <div className="text-blue-100">
                  🪙 {currentUser.walk_coins} WalkCoins | 📏 {currentUser.total_distance_km.toFixed(1)}km
                </div>
              </div>
              <button
                onClick={() => setShowFriends(!showFriends)}
                className="bg-blue-500 hover:bg-blue-700 px-3 py-2 rounded relative"
              >
                👥 Friends
                {(friendRequests.received.length + walkInvitations.received.length) > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    {friendRequests.received.length + walkInvitations.received.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="bg-blue-500 hover:bg-blue-700 px-3 py-2 rounded"
              >
                Profile
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-80 bg-gray-50 p-4 overflow-y-auto">
          {/* City Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Choose City:</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="regensburg">Regensburg</option>
              <option value="deggendorf">Deggendorf</option>
              <option value="passau">Passau</option>
            </select>
          </div>

          {/* POI Filters */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Discover:</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => fetchPOIs(selectedCity, 'restaurant')}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
              >
                🍽️ Restaurants
              </button>
              <button
                onClick={() => fetchPOIs(selectedCity, 'cafe')}
                className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600"
              >
                ☕ Cafes
              </button>
              <button
                onClick={() => fetchPOIs(selectedCity, 'bar')}
                className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600"
              >
                🍺 Bars
              </button>
            </div>
          </div>

          {/* Route Info */}
          {currentRoute && (
            <div className="mb-4 p-3 bg-blue-50 rounded">
              <h3 className="font-semibold mb-2">📍 Planned Route</h3>
              <div className="text-sm space-y-1">
                <div>Distance: {currentRoute.distance_km} km</div>
                <div>Duration: ~{currentRoute.duration_minutes} min</div>
                <div>Will earn: 🪙 {currentRoute.coins_to_earn} WalkCoins</div>
              </div>
              
              {!isWalking ? (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={startWalk}
                    className="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600"
                  >
                    🚀 Start Walking!
                  </button>
                  {friends.length > 0 && (
                    <button
                      onClick={() => setShowInviteFriend(true)}
                      className="w-full bg-purple-500 text-white py-1 rounded hover:bg-purple-600"
                    >
                      👥 Invite Friend
                    </button>
                  )}
                  <button
                    onClick={clearRoute}
                    className="w-full bg-gray-500 text-white py-1 rounded hover:bg-gray-600"
                  >
                    Clear Route
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="text-center text-green-600 font-semibold mb-2">
                    🏃‍♂️ Walking in progress...
                  </div>
                  <button
                    onClick={finishWalk}
                    className="w-full bg-red-500 text-white py-2 rounded hover:bg-red-600"
                  >
                    🏁 Finish Walk
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <h4 className="font-semibold text-sm mb-1">How to use:</h4>
            <ul className="text-xs space-y-1">
              <li>• Click on map to set start point</li>
              <li>• Click again to set destination</li>
              <li>• Start your walk to earn WalkCoins</li>
              <li>• Visit red markers for local deals</li>
            </ul>
          </div>

          {/* Leaderboard */}
          <div className="mb-4">
            <h3 className="font-semibold mb-2">🏆 Top Walkers</h3>
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((user, index) => (
                <div key={index} className="flex justify-between text-sm p-2 bg-gray-100 rounded">
                  <span>#{index + 1} {user.name}</span>
                  <span>{user.total_distance_km.toFixed(1)}km</span>
                </div>
              ))}
            </div>
          </div>

          {/* Friends Activity */}
          {friendsActivity.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">👥 Friends Activity</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {friendsActivity.slice(0, 5).map((activity, index) => (
                  <div key={index} className="text-xs p-2 bg-blue-50 rounded">
                    <div className="font-semibold">{activity.friend_name}</div>
                    <div>completed {activity.route_name}</div>
                    <div className="text-gray-600">
                      {activity.distance_km}km • {activity.coins_earned} coins • {activity.city}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={cityCenters[selectedCity]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            
            {/* Map Click Handler */}
            <MapClickHandler onMapClick={handleMapClick} />
            
            {/* POI Markers */}
            {pois.map((poi) => (
              <Marker
                key={poi.id}
                position={[poi.coordinates[1], poi.coordinates[0]]}
                icon={businessIcon}
              >
                <Popup>
                  <div className="p-2">
                    <h4 className="font-bold">{poi.name}</h4>
                    <p className="text-sm capitalize">{poi.amenity_type}</p>
                    {poi.cuisine && <p className="text-sm">🍴 {poi.cuisine}</p>}
                    {poi.discount_offer && (
                      <div className="mt-2 p-2 bg-green-100 rounded">
                        <p className="text-sm font-semibold text-green-800">
                          🎯 {poi.discount_offer}
                        </p>
                        <p className="text-xs text-green-600">
                          Costs: {poi.coins_required} WalkCoins
                        </p>
                      </div>
                    )}
                    {poi.opening_hours && (
                      <p className="text-xs mt-1">⏰ {poi.opening_hours}</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Waypoint Markers */}
            {waypoints.map((point, index) => (
              <Marker key={index} position={[point.lat, point.lng]}>
                <Popup>
                  <div>
                    {index === 0 ? '🟢 Start' : '🔴 Destination'}
                    <br />
                    {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Route Line */}
            {currentRoute && <RouteLine route={currentRoute} />}
          </MapContainer>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfile && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">👤 Your Profile</h2>
              <button
                onClick={() => setShowProfile(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Name:</span>
                <span className="font-semibold">{currentUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span>WalkCoins:</span>
                <span className="font-semibold">🪙 {currentUser.walk_coins}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Distance:</span>
                <span className="font-semibold">📏 {currentUser.total_distance_km.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span>Member since:</span>
                <span className="font-semibold">
                  {new Date(currentUser.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowProfile(false)}
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Friends Modal */}
      {showFriends && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">👥 Friends & Invitations</h2>
              <button
                onClick={() => setShowFriends(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {/* Add Friend */}
            <div className="mb-4 p-3 bg-blue-50 rounded">
              <h3 className="font-semibold mb-2">Add Friend</h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Friend's email"
                  value={newFriendEmail}
                  onChange={(e) => setNewFriendEmail(e.target.value)}
                  className="flex-1 p-2 border rounded"
                />
                <button
                  onClick={sendFriendRequest}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Send Request
                </button>
              </div>
            </div>

            {/* Friend Requests */}
            {friendRequests.received.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2">📨 Friend Requests</h3>
                {friendRequests.received.map((request) => (
                  <div key={request.id} className="flex justify-between items-center p-2 bg-yellow-50 rounded mb-2">
                    <span>{request.sender_name}</span>
                    <div className="space-x-2">
                      <button
                        onClick={() => respondToFriendRequest(request.id, 'accept')}
                        className="bg-green-500 text-white px-3 py-1 rounded text-sm"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respondToFriendRequest(request.id, 'decline')}
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Walk Invitations */}
            {walkInvitations.received.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2">🚶‍♂️ Walk Invitations</h3>
                {walkInvitations.received.map((invitation) => (
                  <div key={invitation.id} className="p-3 bg-green-50 rounded mb-2">
                    <div className="font-semibold">{invitation.sender_name} invites you to walk</div>
                    <div className="text-sm text-gray-600">
                      {invitation.route_name} in {invitation.city} • {invitation.distance_km}km
                    </div>
                    {invitation.message && (
                      <div className="text-sm italic">"{invitation.message}"</div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => respondToWalkInvitation(invitation.id, 'accept')}
                        className="bg-green-500 text-white px-3 py-1 rounded text-sm"
                      >
                        Accept & Load Route
                      </button>
                      <button
                        onClick={() => respondToWalkInvitation(invitation.id, 'decline')}
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends List */}
            <div className="mb-4">
              <h3 className="font-semibold mb-2">👫 Your Friends ({friends.length})</h3>
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <div>
                      <div className="font-semibold">{friend.name}</div>
                      <div className="text-sm text-gray-600">
                        🪙 {friend.walk_coins} • 📏 {friend.total_distance_km?.toFixed(1) || 0}km
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Friend Modal */}
      {showInviteFriend && currentRoute && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">👥 Invite Friend to Walk</h2>
              <button
                onClick={() => setShowInviteFriend(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-blue-50 rounded">
              <h3 className="font-semibold">Route Details</h3>
              <div className="text-sm">
                <div>Distance: {currentRoute.distance_km} km</div>
                <div>Duration: ~{currentRoute.duration_minutes} min</div>
                <div>City: {selectedCity}</div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Choose a friend:</h3>
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => inviteFriendToWalk(friend.id)}
                  className="w-full p-3 bg-gray-50 hover:bg-blue-50 rounded text-left"
                >
                  <div className="font-semibold">{friend.name}</div>
                  <div className="text-sm text-gray-600">
                    🪙 {friend.walk_coins} • 📏 {friend.total_distance_km?.toFixed(1) || 0}km
                  </div>
                </button>
              ))}
            </div>
            
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowInviteFriend(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Map Click Handler Component
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      console.log('Map clicked at:', e.latlng);
      onMapClick(e);
    },
  });
  return null;
};

export default App;