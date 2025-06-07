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
  const [activeTab, setActiveTab] = useState('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSocial, setShowSocial] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showChallenges, setShowChallenges] = useState(false);
  const [socialFeed, setSocialFeed] = useState([]);
  const [walkingGroups, setWalkingGroups] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [userChallenges, setUserChallenges] = useState([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [newGroupData, setNewGroupData] = useState({ name: '', description: '', city: selectedCity });
  const [newChallengeData, setNewChallengeData] = useState({
    title: '',
    description: '',
    challenge_type: 'distance',
    target_value: 10,
    unit: 'km',
    duration_days: 7
  });

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

  // Enhanced Social Features Functions
  const fetchSocialFeed = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/social/feed/${currentUser.id}`);
      setSocialFeed(response.data);
    } catch (error) {
      console.error('Error fetching social feed:', error);
    }
  };

  const fetchWalkingGroups = async () => {
    try {
      const response = await axios.get(`${API}/groups?city=${selectedCity}`);
      setWalkingGroups(response.data);
    } catch (error) {
      console.error('Error fetching walking groups:', error);
    }
  };

  const fetchUserGroups = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.get(`${API}/groups/user/${currentUser.id}`);
      setUserGroups(response.data);
    } catch (error) {
      console.error('Error fetching user groups:', error);
    }
  };

  const fetchChallenges = async () => {
    try {
      const response = await axios.get(`${API}/challenges`);
      setChallenges(response.data);
    } catch (error) {
      console.error('Error fetching challenges:', error);
    }
  };

  const createWalkingGroup = async () => {
    if (!currentUser || !newGroupData.name || !newGroupData.description) {
      alert('Please fill in all group details');
      return;
    }

    try {
      await axios.post(`${API}/groups?creator_id=${currentUser.id}`, {
        ...newGroupData,
        city: selectedCity
      });
      
      setNewGroupData({ name: '', description: '', city: selectedCity });
      fetchWalkingGroups();
      fetchUserGroups();
      alert('Walking group created successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Error creating group');
    }
  };

  const joinWalkingGroup = async (groupId) => {
    if (!currentUser) return;
    
    try {
      await axios.post(`${API}/groups/${groupId}/join?user_id=${currentUser.id}`);
      fetchWalkingGroups();
      fetchUserGroups();
      alert('Joined group successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Error joining group');
    }
  };

  const createChallenge = async () => {
    if (!currentUser || !newChallengeData.title) {
      alert('Please fill in challenge details');
      return;
    }

    try {
      await axios.post(`${API}/challenges?creator_id=${currentUser.id}`, newChallengeData);
      
      setNewChallengeData({
        title: '',
        description: '',
        challenge_type: 'distance',
        target_value: 10,
        unit: 'km',
        duration_days: 7
      });
      fetchChallenges();
      alert('Challenge created successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Error creating challenge');
    }
  };

  const joinChallenge = async (challengeId) => {
    if (!currentUser) return;
    
    try {
      await axios.post(`${API}/challenges/${challengeId}/join?user_id=${currentUser.id}`);
      fetchChallenges();
      alert('Joined challenge successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Error joining challenge');
    }
  };

  const createSocialPost = async () => {
    if (!currentUser || !newPostContent.trim()) {
      alert('Please enter post content');
      return;
    }

    try {
      await axios.post(`${API}/social/posts?user_id=${currentUser.id}`, {
        post_type: 'general',
        content: newPostContent
      });
      
      setNewPostContent('');
      fetchSocialFeed();
      alert('Post shared successfully!');
    } catch (error) {
      alert('Error creating post');
    }
  };

  const likePost = async (postId) => {
    if (!currentUser) return;
    
    try {
      await axios.post(`${API}/social/posts/${postId}/like?user_id=${currentUser.id}`);
      fetchSocialFeed();
    } catch (error) {
      console.error('Error liking post:', error);
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
      
      // Fetch enhanced social features
      fetchSocialFeed();
      fetchUserGroups();
    }
  }, [currentUser]);

  useEffect(() => {
    fetchWalkingGroups();
    fetchChallenges();
  }, [selectedCity]);

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
      
      // Check for new achievements
      checkForNewAchievements();

      const alertMessage = response.data.new_achievements && response.data.new_achievements.length > 0
        ? `🎉 Walk completed! You earned ${response.data.coins_earned} WalkCoins and ${response.data.new_achievements.length} new achievement(s)!`
        : `🎉 Walk completed! You earned ${response.data.coins_earned} WalkCoins!`;
        
      alert(alertMessage);
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

  // Tab navigation function
  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return renderHomeTab();
      case 'map':
        return renderMapTab();
      case 'deals':
        return renderDealsTab();
      case 'groups':
        return renderGroupsTab();
      case 'profile':
        return renderProfileTab();
      default:
        return renderHomeTab();
    }
  };

  // Tab content renderers
  const renderHomeTab = () => (
    <div className="flex-1 overflow-y-auto pb-20">
      {/* Hero Section */}
      <div className="hero-section">
        <h1 className="hero-title">🚶‍♂️ Entdecke deine Stadt</h1>
        <p className="hero-subtitle">Personalisierte Spaziergänge, versteckte Schätze und neue Freunde erwarten dich</p>
        <div className="relative">
          <input
            type="text"
            placeholder="Wohin möchtest du gehen? 🌍"
            className="search-bar"
          />
          <button className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white text-xl">
            🔍
          </button>
        </div>
      </div>

      {/* Horizontal Scroll Menu */}
      <div className="px-4 mb-6">
        <h2 className="text-xl font-bold mb-4 text-white">✨ Für dich empfohlen</h2>
        <div className="scroll-menu">
          {/* Guided Walks */}
          <div className="scroll-item">
            <div className="text-2xl mb-3">🧭</div>
            <h3 className="font-bold text-lg mb-2 text-white">Geführte Spaziergänge</h3>
            <p className="text-sm text-gray-300 mb-4">Entdecke {selectedCity} mit lokalen Geheimtipps</p>
            <button 
              className="btn-primary w-full"
              onClick={() => setActiveTab('map')}
            >
              Jetzt erkunden
            </button>
          </div>

          {/* Deals Nearby */}
          <div className="scroll-item">
            <div className="text-2xl mb-3">🥗</div>
            <h3 className="font-bold text-lg mb-2 text-white">Deals in der Nähe</h3>
            <p className="text-sm text-gray-300 mb-4">{pois.length} Angebote warten auf dich</p>
            <button 
              className="btn-secondary w-full"
              onClick={() => setActiveTab('deals')}
            >
              Deals sichern
            </button>
          </div>

          {/* Upcoming Events */}
          <div className="scroll-item">
            <div className="text-2xl mb-3">🎉</div>
            <h3 className="font-bold text-lg mb-2 text-white">Events heute</h3>
            <p className="text-sm text-gray-300 mb-4">{challenges.length} Gruppenerlebnisse verfügbar</p>
            <button 
              className="btn-accent w-full"
              onClick={() => setActiveTab('groups')}
            >
              Mitmachen
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {currentUser && (
        <div className="px-4 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">📊 Deine Woche</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="modern-card text-center">
              <div className="text-2xl mb-2">🪙</div>
              <div className="text-2xl font-bold text-white mb-1">{currentUser.walk_coins}</div>
              <div className="text-sm text-gray-300">WalkCoins</div>
            </div>
            <div className="modern-card text-center">
              <div className="text-2xl mb-2">📏</div>
              <div className="text-2xl font-bold text-white mb-1">{currentUser.total_distance_km.toFixed(1)}</div>
              <div className="text-sm text-gray-300">Kilometer</div>
            </div>
          </div>
        </div>
      )}

      {/* Friends Activity Preview */}
      {friendsActivity.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">👥 Freunde unterwegs</h2>
          <div className="space-y-3">
            {friendsActivity.slice(0, 3).map((activity, index) => (
              <div key={index} className="modern-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center">
                    <span className="text-white font-bold">
                      {activity.friend_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white">{activity.friend_name}</div>
                    <div className="text-sm text-gray-300">
                      ging {activity.distance_km}km in {activity.city}
                    </div>
                  </div>
                  <div className="text-sm text-yellow-400 font-bold">
                    +{activity.coins_earned} 🪙
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderMapTab = () => (
    <div className="flex flex-1 overflow-hidden">
      {/* Map Sidebar */}
      <div className="w-80 glass-card m-4 p-4 overflow-y-auto space-y-4 slide-up">
        {/* City Selection */}
        <div className="modern-card">
          <label className="block text-sm font-semibold mb-3 text-white flex items-center gap-2">
            <span className="text-lg">🌍</span>
            Stadt wählen
          </label>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="input-modern"
          >
            <option value="regensburg">🏰 Regensburg</option>
            <option value="deggendorf">🌊 Deggendorf</option>
            <option value="passau">⛰️ Passau</option>
          </select>
        </div>

        {/* POI Discovery */}
        <div className="modern-card">
          <label className="block text-sm font-semibold mb-3 text-white flex items-center gap-2">
            <span className="text-lg">🔍</span>
            Orte entdecken
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => fetchPOIs(selectedCity, 'restaurant')}
              className="btn-secondary text-xs py-3 px-2 rounded-xl"
            >
              <div className="text-lg mb-1">🍽️</div>
              Restaurants
            </button>
            <button
              onClick={() => fetchPOIs(selectedCity, 'cafe')}
              className="btn-accent text-xs py-3 px-2 rounded-xl"
            >
              <div className="text-lg mb-1">☕</div>
              Cafés
            </button>
            <button
              onClick={() => fetchPOIs(selectedCity, 'bar')}
              className="btn-primary text-xs py-3 px-2 rounded-xl"
            >
              <div className="text-lg mb-1">🍺</div>
              Bars
            </button>
          </div>
        </div>

        {/* Route Planning */}
        {currentRoute && (
          <div className="modern-card bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-purple-400/30 bounce-in">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-white">
              <span className="text-2xl">📍</span>
              Deine Route
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Entfernung</span>
                <span className="font-bold text-purple-400">{currentRoute.distance_km} km</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Dauer</span>
                <span className="font-bold text-pink-400">~{currentRoute.duration_minutes} min</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">WalkCoins</span>
                <span className="font-bold text-yellow-400 flex items-center gap-1">
                  <span>🪙</span> {currentRoute.coins_to_earn}
                </span>
              </div>
              
              {!isWalking ? (
                <div className="space-y-2 mt-4">
                  <button
                    onClick={startWalk}
                    className="w-full btn-success py-4 text-lg font-bold rounded-xl pulse-success"
                  >
                    🚀 Jetzt losgehen!
                  </button>
                  {friends.length > 0 && (
                    <button
                      onClick={() => setShowInviteFriend(true)}
                      className="w-full btn-secondary py-3 text-sm rounded-xl"
                    >
                      👥 Freund einladen
                    </button>
                  )}
                  <button
                    onClick={clearRoute}
                    className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-xl transition-all duration-300"
                  >
                    Route löschen
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <div className="text-center text-green-400 font-bold mb-3 walking-indicator">
                    <div className="text-2xl mb-2">🏃‍♂️</div>
                    Du bist unterwegs...
                  </div>
                  <button
                    onClick={finishWalk}
                    className="w-full bg-gradient-to-r from-red-500 to-pink-600 text-white py-4 text-lg font-bold rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-300"
                  >
                    🏁 Spaziergang beenden
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="modern-card bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-400/30">
          <h4 className="font-bold text-sm mb-2 flex items-center gap-2 text-white">
            <span className="text-lg">💡</span>
            So funktioniert's
          </h4>
          <ul className="text-xs space-y-1 text-gray-300">
            <li className="flex items-center gap-2">
              <span className="text-blue-400">•</span>
              Tippe zweimal auf die Karte für deine Route
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">•</span>
              Gehe spazieren und sammle WalkCoins
            </li>
            <li className="flex items-center gap-2">
              <span className="text-purple-400">•</span>
              Lade Freunde zu gemeinsamen Walks ein
            </li>
            <li className="flex items-center gap-2">
              <span className="text-pink-400">•</span>
              Besuche Locations für exklusive Deals
            </li>
          </ul>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative m-4 mr-4">
        <div className="h-full w-full rounded-2xl overflow-hidden shadow-2xl">
          <MapContainer
            center={cityCenters[selectedCity]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            
            <MapClickHandler onMapClick={handleMapClick} />
            
            {pois.map((poi) => (
              <Marker
                key={poi.id}
                position={[poi.coordinates[1], poi.coordinates[0]]}
                icon={businessIcon}
              >
                <Popup className="modern-popup">
                  <div className="p-4 min-w-[250px]">
                    <h4 className="font-bold text-lg mb-2 text-white">{poi.name}</h4>
                    <p className="text-sm text-gray-300 capitalize mb-3 flex items-center gap-2">
                      <span className="text-lg">🏪</span>
                      {poi.amenity_type}
                    </p>
                    {poi.cuisine && (
                      <p className="text-sm mb-3 flex items-center gap-2 text-gray-300">
                        <span className="text-lg">🍴</span>
                        <span className="font-medium">{poi.cuisine}</span>
                      </p>
                    )}
                    {poi.discount_offer && (
                      <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 p-3 rounded-xl border border-green-400/30 mb-3">
                        <p className="text-sm font-bold text-green-400 flex items-center gap-2">
                          <span className="text-lg">🎯</span>
                          {poi.discount_offer}
                        </p>
                        <p className="text-xs text-green-300 mt-1 flex items-center gap-1">
                          <span>🪙</span>
                          Kostet: {poi.coins_required} WalkCoins
                        </p>
                      </div>
                    )}
                    {poi.opening_hours && (
                      <p className="text-xs text-gray-400 flex items-center gap-2">
                        <span>⏰</span> {poi.opening_hours}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {waypoints.map((point, index) => (
              <Marker key={index} position={[point.lat, point.lng]}>
                <Popup>
                  <div className="p-2 text-center">
                    <div className="text-lg mb-1 text-white">
                      {index === 0 ? '🟢 Start' : '🔴 Ziel'}
                    </div>
                    <div className="text-sm text-gray-300">
                      {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {currentRoute && <RouteLine route={currentRoute} />}
          </MapContainer>
        </div>
        
        {waypoints.length === 0 && (
          <div className="absolute top-4 left-4 right-4 glass-card p-4 text-center fade-in">
            <div className="text-lg mb-2">🗺️</div>
            <p className="text-sm font-medium text-white">
              Tippe auf die Karte um deine Route zu planen
            </p>
            <p className="text-xs text-gray-300 mt-1">
              Zwei Tipps erstellen Start- und Endpunkt
            </p>
          </div>
        )}
        
        {waypoints.length === 1 && (
          <div className="absolute top-4 left-4 right-4 glass-card p-4 text-center bounce-in">
            <div className="text-lg mb-2">✨</div>
            <p className="text-sm font-medium text-white">
              Perfekt! Jetzt tippe für dein Ziel
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>

      {/* Bottom Navigation - NeoTaste Style */}
      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Entdecken</div>
        </button>
        
        <button
          className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <div className="nav-icon">🗺️</div>
          <div className="nav-label">Karte</div>
        </button>
        
        <button
          className={`nav-item ${activeTab === 'deals' ? 'active' : ''}`}
          onClick={() => setActiveTab('deals')}
        >
          <div className="nav-icon">🍴</div>
          <div className="nav-label">Deals</div>
          {pois.length > 0 && (
            <span className="badge-modern">{pois.length}</span>
          )}
        </button>
        
        <button
          className={`nav-item ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveTab('groups')}
        >
          <div className="nav-icon">👥</div>
          <div className="nav-label">Gruppen</div>
          {(walkingGroups.length + challenges.length) > 0 && (
            <span className="badge-modern">{walkingGroups.length + challenges.length}</span>
          )}
        </button>
        
        <button
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <div className="nav-icon">👤</div>
          <div className="nav-label">Profil</div>
          {achievementStats && achievementStats.total_achievements > 0 && (
            <span className="badge-modern">{achievementStats.total_achievements}</span>
          )}
        </button>
      </nav>

      {/* Floating Action Button */}
      <button className="fab floating" onClick={() => setActiveTab('map')}>
        ➕
      </button>

      <div className="flex flex-1 overflow-hidden">
        {/* Modern Sidebar with Glass Effect */}
        <div className="w-80 glass-card m-4 p-4 overflow-y-auto space-y-4 slide-up">
          {/* Quick Actions */}
          <div className="modern-card">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowGroups(!showGroups)}
                className="btn-success text-sm py-3 px-4 rounded-xl"
              >
                <div className="text-lg mb-1">👥</div>
                Groups
              </button>
              <button
                onClick={() => setShowChallenges(!showChallenges)}
                className="btn-warning text-sm py-3 px-4 rounded-xl"
              >
                <div className="text-lg mb-1">🏃‍♂️</div>
                Challenges
              </button>
            </div>
          </div>

          {/* City Selection */}
          <div className="modern-card">
            <label className="block text-sm font-semibold mb-3 text-gray-700 flex items-center gap-2">
              <span className="text-lg">🌍</span>
              Explore City
            </label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="input-modern"
            >
              <option value="regensburg">🏰 Regensburg</option>
              <option value="deggendorf">🌊 Deggendorf</option>
              <option value="passau">⛰️ Passau</option>
            </select>
          </div>

          {/* POI Discovery */}
          <div className="modern-card">
            <label className="block text-sm font-semibold mb-3 text-gray-700 flex items-center gap-2">
              <span className="text-lg">🔍</span>
              Discover Places
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => fetchPOIs(selectedCity, 'restaurant')}
                className="btn-secondary text-xs py-3 px-2 rounded-xl ripple"
              >
                <div className="text-lg mb-1">🍽️</div>
                Restaurants
              </button>
              <button
                onClick={() => fetchPOIs(selectedCity, 'cafe')}
                className="btn-warning text-xs py-3 px-2 rounded-xl ripple"
              >
                <div className="text-lg mb-1">☕</div>
                Cafes
              </button>
              <button
                onClick={() => fetchPOIs(selectedCity, 'bar')}
                className="btn-modern text-xs py-3 px-2 rounded-xl ripple"
              >
                <div className="text-lg mb-1">🍺</div>
                Bars
              </button>
            </div>
          </div>

          {/* Route Planning Card */}
          {currentRoute && (
            <div className="modern-card bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 achievement-unlock">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">📍</span>
                Your Route
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Distance</span>
                  <span className="font-bold text-blue-600">{currentRoute.distance_km} km</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Duration</span>
                  <span className="font-bold text-purple-600">~{currentRoute.duration_minutes} min</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">WalkCoins</span>
                  <span className="font-bold text-yellow-600 flex items-center gap-1">
                    <span>🪙</span> {currentRoute.coins_to_earn}
                  </span>
                </div>
                
                {!isWalking ? (
                  <div className="space-y-2 mt-4">
                    <button
                      onClick={startWalk}
                      className="w-full btn-success py-4 text-lg font-bold rounded-xl ripple"
                    >
                      🚀 Start Walking!
                    </button>
                    {friends.length > 0 && (
                      <button
                        onClick={() => setShowInviteFriend(true)}
                        className="w-full btn-secondary py-3 text-sm rounded-xl"
                      >
                        👥 Invite Friend
                      </button>
                    )}
                    <button
                      onClick={clearRoute}
                      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-xl transition-all duration-300"
                    >
                      Clear Route
                    </button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="text-center text-green-600 font-bold mb-3 walking-indicator">
                      <div className="text-2xl mb-2">🏃‍♂️</div>
                      Walking in progress...
                    </div>
                    <button
                      onClick={finishWalk}
                      className="w-full bg-gradient-to-r from-red-400 to-pink-500 text-white py-4 text-lg font-bold rounded-xl hover:from-red-500 hover:to-pink-600 transition-all duration-300 ripple"
                    >
                      🏁 Finish Walk
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="modern-card bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200">
            <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
              <span className="text-lg">💡</span>
              How to use
            </h4>
            <ul className="text-xs space-y-1 text-gray-600">
              <li className="flex items-center gap-2">
                <span className="text-blue-500">•</span>
                Tap map twice to plan route
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">•</span>
                Start walking to earn coins
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                Invite friends to join
              </li>
              <li className="flex items-center gap-2">
                <span className="text-red-500">•</span>
                Visit places for discounts
              </li>
            </ul>
          </div>

          {/* Social Activity Preview */}
          {userGroups.length > 0 && (
            <div className="modern-card">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <span className="text-lg">👥</span>
                Your Groups
              </h3>
              <div className="space-y-2">
                {userGroups.slice(0, 3).map((group, index) => (
                  <div key={index} className="bg-green-50 p-3 rounded-xl border border-green-200">
                    <div className="font-semibold text-sm text-green-800">{group.name}</div>
                    <div className="text-xs text-green-600">{group.member_count} members • {group.city}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Challenges Preview */}
          {challenges.length > 0 && (
            <div className="modern-card">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <span className="text-lg">🏃‍♂️</span>
                Active Challenges
              </h3>
              <div className="space-y-2">
                {challenges.slice(0, 2).map((challenge, index) => (
                  <div key={index} className="bg-red-50 p-3 rounded-xl border border-red-200">
                    <div className="font-semibold text-sm text-red-800">{challenge.title}</div>
                    <div className="text-xs text-red-600">
                      {challenge.target_value} {challenge.unit} • {challenge.participants.length} participants
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievement Progress */}
          {achievementProgress.length > 0 && (
            <div className="modern-card">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <span className="text-lg">🏆</span>
                Next Achievements
              </h3>
              <div className="space-y-3">
                {achievementProgress
                  .filter(ach => !ach.is_completed && ach.progress_percentage > 0)
                  .slice(0, 3)
                  .map((achievement, index) => (
                    <div key={index} className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm flex items-center gap-2">
                          <span className="text-lg">{achievement.icon}</span>
                          {achievement.achievement_name}
                        </span>
                        <span className="text-xs text-gray-500 capitalize bg-white px-2 py-1 rounded">
                          {achievement.tier}
                        </span>
                      </div>
                      <div className="progress-modern">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${achievement.progress_percentage}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-600 mt-2 flex justify-between">
                        <span>{achievement.current_value}/{achievement.target_value}</span>
                        <span>{Math.round(achievement.progress_percentage)}%</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className="modern-card">
            <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
              <span className="text-lg">🏆</span>
              Top Walkers
            </h3>
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((user, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="font-medium text-sm">{user.name}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{user.total_distance_km.toFixed(1)}km</span>
                </div>
              ))}
            </div>
          </div>

          {/* Friends Activity */}
          {friendsActivity.length > 0 && (
            <div className="modern-card">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <span className="text-lg">👥</span>
                Friends Activity
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {friendsActivity.slice(0, 5).map((activity, index) => (
                  <div key={index} className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                    <div className="font-semibold text-sm text-blue-800">{activity.friend_name}</div>
                    <div className="text-xs text-blue-600">completed {activity.route_name}</div>
                    <div className="text-xs text-gray-600 flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1">
                        <span>📏</span> {activity.distance_km}km
                      </span>
                      <span className="flex items-center gap-1">
                        <span>🪙</span> {activity.coins_earned}
                      </span>
                      <span className="capitalize">{activity.city}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modern Map Container */}
        <div className="flex-1 relative m-4 mr-4">
          <div className="h-full w-full rounded-2xl overflow-hidden shadow-2xl">
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
                  <Popup className="modern-popup">
                    <div className="p-4 min-w-[250px]">
                      <h4 className="font-bold text-lg mb-2 text-gray-800">{poi.name}</h4>
                      <p className="text-sm text-gray-600 capitalize mb-3 flex items-center gap-2">
                        <span className="text-lg">🏪</span>
                        {poi.amenity_type}
                      </p>
                      {poi.cuisine && (
                        <p className="text-sm mb-3 flex items-center gap-2">
                          <span className="text-lg">🍴</span>
                          <span className="font-medium">{poi.cuisine}</span>
                        </p>
                      )}
                      {poi.discount_offer && (
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-3 rounded-xl border border-green-200 mb-3">
                          <p className="text-sm font-bold text-green-800 flex items-center gap-2">
                            <span className="text-lg">🎯</span>
                            {poi.discount_offer}
                          </p>
                          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <span>🪙</span>
                            Costs: {poi.coins_required} WalkCoins
                          </p>
                        </div>
                      )}
                      {poi.opening_hours && (
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <span>⏰</span> {poi.opening_hours}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
              
              {/* Waypoint Markers */}
              {waypoints.map((point, index) => (
                <Marker key={index} position={[point.lat, point.lng]}>
                  <Popup>
                    <div className="p-2 text-center">
                      <div className="text-lg mb-1">
                        {index === 0 ? '🟢 Start' : '🔴 Destination'}
                      </div>
                      <div className="text-sm text-gray-600">
                        {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              
              {/* Route Line */}
              {currentRoute && <RouteLine route={currentRoute} />}
            </MapContainer>
          </div>
          
          {/* Map Overlay Instructions */}
          {waypoints.length === 0 && (
            <div className="absolute top-4 left-4 right-4 glass-card p-4 text-center fade-in">
              <div className="text-lg mb-2">🗺️</div>
              <p className="text-sm font-medium text-gray-700">
                Tap on the map to start planning your walking route
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Two taps create start and end points
              </p>
            </div>
          )}
          
          {waypoints.length === 1 && (
            <div className="absolute top-4 left-4 right-4 glass-card p-4 text-center achievement-unlock">
              <div className="text-lg mb-2">✨</div>
              <p className="text-sm font-medium text-gray-700">
                Great! Now tap to set your destination
              </p>
            </div>
          )}
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
      {/* Modern Achievement Modal */}
      {showAchievements && currentUser && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
          <div className="modal-content max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                  🏆 Your Achievements
                </h2>
                <p className="text-gray-600 mt-1">Track your walking milestones</p>
              </div>
              <button
                onClick={() => setShowAchievements(false)}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all duration-300"
              >
                <span className="text-gray-600">✕</span>
              </button>
            </div>
            
            {/* Achievement Stats with Modern Cards */}
            {achievementStats && (
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-bold mb-4 text-gray-800">📊 Your Progress</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="modern-card text-center bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200">
                    <div className="text-3xl font-bold text-yellow-600 mb-1">{achievementStats.total_achievements}</div>
                    <div className="text-sm text-gray-600">Achievements Earned</div>
                  </div>
                  <div className="modern-card text-center bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
                    <div className="text-3xl font-bold text-purple-600 mb-1">{achievementStats.total_points}</div>
                    <div className="text-sm text-gray-600">Achievement Points</div>
                  </div>
                  <div className="modern-card text-center bg-gradient-to-br from-green-50 to-blue-50 border border-green-200">
                    <div className="text-3xl font-bold text-green-600 mb-1">{achievementStats.completion_percentage}%</div>
                    <div className="text-sm text-gray-600">Completion Rate</div>
                  </div>
                  <div className="modern-card text-center bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                    <div className="text-3xl font-bold text-blue-600 mb-1">
                      {achievementStats.tier_counts.gold + achievementStats.tier_counts.platinum}
                    </div>
                    <div className="text-sm text-gray-600">Elite Badges</div>
                  </div>
                </div>
              </div>
            )}

            {/* Earned Achievements */}
            <div className="p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-800 flex items-center gap-2">
                <span className="text-2xl">🎖️</span>
                Earned Achievements ({userAchievements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {userAchievements.map((achievement) => (
                  <div key={achievement.id} className={`modern-card relative overflow-hidden ${
                    achievement.achievement_tier === 'platinum' ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-300' :
                    achievement.achievement_tier === 'gold' ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-300' :
                    achievement.achievement_tier === 'silver' ? 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-300' :
                    'bg-gradient-to-br from-orange-50 to-red-50 border-orange-300'
                  } border-2`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-3xl mb-2">{achievement.achievement_icon}</div>
                        <div className="font-bold text-base mb-1">{achievement.achievement_name}</div>
                        <div className="text-sm text-gray-600 mb-3">{achievement.achievement_description}</div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{new Date(achievement.earned_at).toLocaleDateString()}</span>
                          <span className="font-bold text-purple-600">{achievement.achievement_points} pts</span>
                        </div>
                      </div>
                      {achievement.is_new && (
                        <span className="absolute top-3 right-3 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                          NEW!
                        </span>
                      )}
                    </div>
                    <div className={`absolute bottom-0 left-0 right-0 h-1 ${
                      achievement.achievement_tier === 'platinum' ? 'bg-gradient-to-r from-purple-500 to-indigo-500' :
                      achievement.achievement_tier === 'gold' ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                      achievement.achievement_tier === 'silver' ? 'bg-gradient-to-r from-gray-400 to-slate-400' :
                      'bg-gradient-to-r from-orange-500 to-red-500'
                    }`}></div>
                  </div>
                ))}
              </div>

              {/* Progress Toward Next Achievements */}
              <h3 className="text-lg font-bold mb-4 text-gray-800 flex items-center gap-2">
                <span className="text-2xl">📈</span>
                Progress Toward Next Achievements
              </h3>
              <div className="space-y-4">
                {achievementProgress
                  .filter(ach => !ach.is_completed)
                  .slice(0, 6)
                  .map((achievement, index) => (
                    <div key={index} className="modern-card bg-gradient-to-r from-gray-50 to-white border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{achievement.icon}</span>
                          <div>
                            <div className="font-bold text-base">{achievement.achievement_name}</div>
                            <div className="text-sm text-gray-600">{achievement.description}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-800">{Math.round(achievement.progress_percentage)}%</div>
                          <div className="text-xs text-gray-500 capitalize flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              achievement.tier === 'platinum' ? 'bg-purple-500' :
                              achievement.tier === 'gold' ? 'bg-yellow-500' :
                              achievement.tier === 'silver' ? 'bg-gray-400' :
                              'bg-orange-500'
                            }`}></span>
                            {achievement.tier} • {achievement.points}pts
                          </div>
                        </div>
                      </div>
                      <div className="progress-modern mb-2">
                        <div 
                          className={`progress-fill ${
                            achievement.tier === 'platinum' ? 'bg-gradient-to-r from-purple-500 to-indigo-500' :
                            achievement.tier === 'gold' ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                            achievement.tier === 'silver' ? 'bg-gradient-to-r from-gray-400 to-slate-400' :
                            'bg-gradient-to-r from-orange-500 to-red-500'
                          }`}
                          style={{ width: `${achievement.progress_percentage}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>{achievement.current_value} / {achievement.target_value}</span>
                        <span>{achievement.target_value - achievement.current_value} to go</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Social Feed Modal */}
      {showSocial && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">📱 Social Feed</h2>
              <button
                onClick={() => setShowSocial(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {/* Create Post */}
            <div className="mb-4 p-3 bg-purple-50 rounded">
              <h3 className="font-semibold mb-2">Share with the community</h3>
              <textarea
                placeholder="What's on your mind? Share your walking experience..."
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="w-full p-2 border rounded resize-none"
                rows="3"
              />
              <button
                onClick={createSocialPost}
                className="mt-2 bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              >
                📝 Share Post
              </button>
            </div>

            {/* Social Feed */}
            <div className="space-y-3">
              {socialFeed.map((post) => (
                <div key={post.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold">{post.user_name}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(post.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded">{post.post_type}</span>
                  </div>
                  <div className="text-sm mb-2">{post.content}</div>
                  <div className="flex gap-4 text-xs text-gray-600">
                    <button
                      onClick={() => likePost(post.id)}
                      className="hover:text-red-500"
                    >
                      ❤️ {post.likes_count} likes
                    </button>
                    <span>💬 {post.comments_count} comments</span>
                  </div>
                </div>
              ))}
              {socialFeed.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No posts yet. Add friends and start sharing your walks!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Walking Groups Modal */}
      {showGroups && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">👥 Walking Groups</h2>
              <button
                onClick={() => setShowGroups(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {/* Create Group */}
            <div className="mb-6 p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold mb-3">Create New Group</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Group name"
                  value={newGroupData.name}
                  onChange={(e) => setNewGroupData({...newGroupData, name: e.target.value})}
                  className="p-2 border rounded"
                />
                <select
                  value={newGroupData.city}
                  onChange={(e) => setNewGroupData({...newGroupData, city: e.target.value})}
                  className="p-2 border rounded"
                >
                  <option value="regensburg">Regensburg</option>
                  <option value="deggendorf">Deggendorf</option>
                  <option value="passau">Passau</option>
                </select>
              </div>
              <textarea
                placeholder="Group description"
                value={newGroupData.description}
                onChange={(e) => setNewGroupData({...newGroupData, description: e.target.value})}
                className="w-full p-2 border rounded mt-3"
                rows="2"
              />
              <button
                onClick={createWalkingGroup}
                className="mt-3 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                🏗️ Create Group
              </button>
            </div>

            {/* Available Groups */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {walkingGroups.map((group) => (
                <div key={group.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{group.name}</h4>
                    <span className="text-xs bg-green-100 px-2 py-1 rounded">{group.city}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{group.description}</p>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">
                      👤 {group.member_count}/{group.max_members} members<br/>
                      📏 {group.total_distance_km}km total
                    </div>
                    <button
                      onClick={() => joinWalkingGroup(group.id)}
                      className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Challenges Modal */}
      {showChallenges && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">🏃‍♂️ Walking Challenges</h2>
              <button
                onClick={() => setShowChallenges(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {/* Create Challenge */}
            <div className="mb-6 p-4 bg-red-50 rounded-lg">
              <h3 className="font-semibold mb-3">Create New Challenge</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Challenge title"
                  value={newChallengeData.title}
                  onChange={(e) => setNewChallengeData({...newChallengeData, title: e.target.value})}
                  className="p-2 border rounded"
                />
                <select
                  value={newChallengeData.challenge_type}
                  onChange={(e) => setNewChallengeData({...newChallengeData, challenge_type: e.target.value})}
                  className="p-2 border rounded"
                >
                  <option value="distance">Distance Challenge</option>
                  <option value="walks_count">Number of Walks</option>
                  <option value="streak">Daily Streak</option>
                </select>
                <input
                  type="number"
                  placeholder="Target value"
                  value={newChallengeData.target_value}
                  onChange={(e) => setNewChallengeData({...newChallengeData, target_value: parseFloat(e.target.value)})}
                  className="p-2 border rounded"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Duration (days)"
                  value={newChallengeData.duration_days}
                  onChange={(e) => setNewChallengeData({...newChallengeData, duration_days: parseInt(e.target.value)})}
                  className="p-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={newChallengeData.description}
                  onChange={(e) => setNewChallengeData({...newChallengeData, description: e.target.value})}
                  className="p-2 border rounded"
                />
              </div>
              <button
                onClick={createChallenge}
                className="mt-3 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                🚀 Create Challenge
              </button>
            </div>

            {/* Active Challenges */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {challenges.map((challenge) => (
                <div key={challenge.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{challenge.title}</h4>
                    <span className="text-xs bg-red-100 px-2 py-1 rounded capitalize">{challenge.challenge_type}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{challenge.description}</p>
                  <div className="text-sm mb-3">
                    <div>🎯 Target: {challenge.target_value} {challenge.unit}</div>
                    <div>⏰ Duration: {challenge.duration_days} days</div>
                    <div>👥 Participants: {challenge.participants.length}</div>
                  </div>
                  <button
                    onClick={() => joinChallenge(challenge.id)}
                    className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600"
                  >
                    Join Challenge
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modern Achievement Unlock Alert */}
      {newAchievementAlert && (
        <div className="fixed top-20 right-4 z-50 max-w-sm achievement-unlock">
          <div className="modern-card bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-white p-6 shadow-heavy">
            <div className="flex items-center gap-4">
              <div className="text-4xl floating">{newAchievementAlert.achievement_icon}</div>
              <div className="flex-1">
                <div className="font-bold text-lg mb-1">🎉 Achievement Unlocked!</div>
                <div className="font-semibold">{newAchievementAlert.achievement_name}</div>
                <div className="text-sm opacity-90">{newAchievementAlert.achievement_description}</div>
                <div className="text-xs opacity-75 mt-2 flex items-center gap-2">
                  <span>+{newAchievementAlert.achievement_points} points</span>
                  <span className="w-1 h-1 bg-white rounded-full"></span>
                  <span className="capitalize">{newAchievementAlert.achievement_tier} tier</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setNewAchievementAlert(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 flex items-center justify-center transition-all duration-300"
            >
              <span className="text-white font-bold">✕</span>
            </button>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white bg-opacity-30">
              <div className="h-full bg-white bg-opacity-60 animate-pulse"></div>
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