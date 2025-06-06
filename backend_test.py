
import requests
import unittest
import json
import time
from datetime import datetime

class GoWalkingAPITester:
    def __init__(self, base_url="https://b4a7b043-be6d-4e77-9fa8-1f643b98948b.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.test_user = None
        self.test_user2 = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.test_route = None

    def run_test(self, name, method, endpoint, expected_status=200, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            
            # Try to get JSON response, but handle cases where response is not JSON
            try:
                response_data = response.json()
                response_preview = json.dumps(response_data, indent=2)[:500] + "..." if len(json.dumps(response_data)) > 500 else json.dumps(response_data, indent=2)
            except:
                response_data = {}
                response_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                print(f"Response: {response_preview}")
                self.test_results.append({
                    "name": name,
                    "status": "PASS",
                    "endpoint": endpoint,
                    "response_code": response.status_code
                })
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response_preview}")
                self.test_results.append({
                    "name": name,
                    "status": "FAIL",
                    "endpoint": endpoint,
                    "response_code": response.status_code,
                    "error": response_preview
                })

            return success, response_data

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({
                "name": name,
                "status": "ERROR",
                "endpoint": endpoint,
                "error": str(e)
            })
            return False, {}

    def test_health_endpoints(self):
        """Test the health and root endpoints"""
        print("\n=== Testing Health Endpoints ===")
        self.run_test("API Root", "GET", "")
        self.run_test("Health Check", "GET", "health")

    def test_user_management(self):
        """Test user management endpoints"""
        print("\n=== Testing User Management ===")
        
        # Create a test user
        timestamp = int(time.time())
        user_data = {
            "name": f"TestUser_{timestamp}",
            "email": f"test_{timestamp}@example.com"
        }
        
        success, response = self.run_test(
            "Create User", 
            "POST", 
            "users", 
            expected_status=200, 
            data=user_data
        )
        
        if success:
            self.test_user = response
            user_id = response.get("id")
            
            # Create a second test user for friend testing
            user2_data = {
                "name": f"TestFriend_{timestamp}",
                "email": f"friend_{timestamp}@example.com"
            }
            
            success2, response2 = self.run_test(
                "Create Second User", 
                "POST", 
                "users", 
                expected_status=200, 
                data=user2_data
            )
            
            if success2:
                self.test_user2 = response2
            
            # Get user by ID
            self.run_test("Get User by ID", "GET", f"users/{user_id}")
            
            # Get all users
            self.run_test("Get All Users", "GET", "users")
        else:
            print("❌ User creation failed, skipping other user tests")

    def test_poi_endpoints(self):
        """Test POI endpoints"""
        print("\n=== Testing POI Endpoints ===")
        
        # Test POI for each city and amenity type
        cities = ["regensburg", "deggendorf", "passau"]
        amenities = ["restaurant", "cafe", "bar"]
        
        for city in cities:
            for amenity in amenities:
                self.run_test(
                    f"Get POIs - {city.capitalize()} {amenity}s", 
                    "POST", 
                    "poi", 
                    data={"city": city, "amenity_type": amenity}
                )
        
        # Test supported cities endpoint
        self.run_test("Get Supported Cities", "GET", "poi/cities")

    def test_route_planning(self):
        """Test route planning endpoints"""
        print("\n=== Testing Route Planning ===")
        
        # Test route calculation for each city
        test_routes = {
            "regensburg": {"start": [12.12, 49.03], "end": [12.15, 49.05]},
            "deggendorf": {"start": [12.96, 48.84], "end": [12.98, 48.86]},
            "passau": {"start": [13.43, 48.57], "end": [13.45, 48.59]}
        }
        
        for city, coords in test_routes.items():
            success, response = self.run_test(
                f"Calculate Route - {city.capitalize()}", 
                "POST", 
                "route/calculate", 
                data={
                    "start": coords["start"],
                    "end": coords["end"],
                    "city": city
                }
            )
            
            # Save a test route for walk invitation testing
            if success and city == "regensburg" and not self.test_route:
                self.test_route = {
                    "start_point": coords["start"],
                    "end_point": coords["end"],
                    "city": city,
                    "distance_km": response.get("distance_km", 2.5),
                    "route_name": f"Test Route in {city.capitalize()}"
                }

    def test_walking_system(self):
        """Test walking system endpoints"""
        print("\n=== Testing Walking System ===")
        
        if not self.test_user:
            print("❌ No test user available, skipping walk tests")
            return
        
        # Create a walk
        walk_data = {
            "user_id": self.test_user["id"],
            "route_name": "Test Walk",
            "distance_km": 2.5,
            "duration_minutes": 30,
            "start_point": [12.12, 49.03],
            "end_point": [12.15, 49.05],
            "city": "regensburg"
        }
        
        success, response = self.run_test(
            "Create Walk", 
            "POST", 
            "walks", 
            data=walk_data
        )
        
        if success:
            # Get user walks
            self.run_test(
                "Get User Walks", 
                "GET", 
                f"walks/user/{self.test_user['id']}"
            )
            
            # Get leaderboard
            self.run_test("Get Leaderboard", "GET", "walks/leaderboard")
        else:
            print("❌ Walk creation failed, skipping other walk tests")

    def test_geocoding(self):
        """Test geocoding endpoint"""
        print("\n=== Testing Geocoding ===")
        
        # Test geocoding with a German address
        self.run_test(
            "Geocode Address", 
            "GET", 
            "geocode", 
            params={"address": "Regensburg Hauptbahnhof"}
        )
    
    def test_friend_system(self):
        """Test friend system endpoints"""
        print("\n=== Testing Friend System ===")
        
        if not self.test_user or not self.test_user2:
            print("❌ Test users not available, skipping friend system tests")
            return
        
        # Send friend request
        success, friend_request = self.run_test(
            "Send Friend Request",
            "POST",
            f"friends/request?current_user_id={self.test_user['id']}",
            data={"receiver_email": self.test_user2["email"]}
        )
        
        if not success:
            print("❌ Friend request failed, skipping other friend tests")
            return
            
        # Test duplicate friend request (should fail)
        self.run_test(
            "Send Duplicate Friend Request (should fail)",
            "POST",
            f"friends/request?current_user_id={self.test_user['id']}",
            expected_status=400,
            data={"receiver_email": self.test_user2["email"]}
        )
        
        # Test self friend request (should fail)
        self.run_test(
            "Send Friend Request to Self (should fail)",
            "POST",
            f"friends/request?current_user_id={self.test_user['id']}",
            expected_status=400,
            data={"receiver_email": self.test_user["email"]}
        )
        
        # Get friend requests for both users
        self.run_test(
            "Get Friend Requests - Sender",
            "GET",
            f"friends/requests/{self.test_user['id']}"
        )
        
        self.run_test(
            "Get Friend Requests - Receiver",
            "GET",
            f"friends/requests/{self.test_user2['id']}"
        )
        
        # Accept friend request
        self.run_test(
            "Accept Friend Request",
            "POST",
            f"friends/respond/{friend_request['id']}?action=accept"
        )
        
        # Get friends list
        self.run_test(
            "Get Friends List - User 1",
            "GET",
            f"friends/{self.test_user['id']}"
        )
        
        self.run_test(
            "Get Friends List - User 2",
            "GET",
            f"friends/{self.test_user2['id']}"
        )
    
    def test_walk_invitations(self):
        """Test walk invitation endpoints"""
        print("\n=== Testing Walk Invitation System ===")
        
        if not self.test_user or not self.test_user2 or not self.test_route:
            print("❌ Test users or route not available, skipping walk invitation tests")
            return
        
        # Send walk invitation
        invitation_data = {
            "receiver_id": self.test_user2["id"],
            "route_name": self.test_route["route_name"],
            "start_point": self.test_route["start_point"],
            "end_point": self.test_route["end_point"],
            "city": self.test_route["city"],
            "distance_km": self.test_route["distance_km"],
            "message": "Let's go for a walk!"
        }
        
        success, invitation = self.run_test(
            "Send Walk Invitation",
            "POST",
            f"walk-invitations?sender_id={self.test_user['id']}",
            data=invitation_data
        )
        
        if not success:
            print("❌ Walk invitation failed, skipping other invitation tests")
            return
            
        # Get walk invitations for both users
        self.run_test(
            "Get Walk Invitations - Sender",
            "GET",
            f"walk-invitations/{self.test_user['id']}"
        )
        
        self.run_test(
            "Get Walk Invitations - Receiver",
            "GET",
            f"walk-invitations/{self.test_user2['id']}"
        )
        
        # Accept walk invitation
        self.run_test(
            "Accept Walk Invitation",
            "POST",
            f"walk-invitations/respond/{invitation['id']}?action=accept"
        )
        
        # Test declining a walk invitation (create a new one first)
        success, invitation2 = self.run_test(
            "Send Second Walk Invitation",
            "POST",
            f"walk-invitations?sender_id={self.test_user['id']}",
            data=invitation_data
        )
        
        if success:
            self.run_test(
                "Decline Walk Invitation",
                "POST",
                f"walk-invitations/respond/{invitation2['id']}?action=decline"
            )
    
    def test_friends_activity(self):
        """Test friends activity endpoint"""
        print("\n=== Testing Friends Activity ===")
        
        if not self.test_user:
            print("❌ Test user not available, skipping friends activity test")
            return
        
        # Get friends activity
        self.run_test(
            "Get Friends Activity",
            "GET",
            f"friends/activity/{self.test_user['id']}"
        )

    def print_summary(self):
        """Print a summary of all test results"""
        print("\n" + "="*50)
        print(f"📊 TEST SUMMARY: {self.tests_passed}/{self.tests_run} tests passed")
        print("="*50)
        
        if self.tests_passed < self.tests_run:
            print("\nFailed Tests:")
            for result in self.test_results:
                if result["status"] != "PASS":
                    print(f"- {result['name']} ({result['endpoint']}): {result.get('error', 'No error details')}")
        
        print("\n")

def run_tests():
    tester = GoWalkingAPITester()
    
    # Run all tests
    tester.test_health_endpoints()
    tester.test_user_management()
    tester.test_poi_endpoints()
    tester.test_route_planning()
    tester.test_walking_system()
    tester.test_geocoding()
    
    # Test new friend system features
    tester.test_friend_system()
    tester.test_walk_invitations()
    tester.test_friends_activity()
    
    # Print summary
    tester.print_summary()
    
    return tester.tests_passed == tester.tests_run

if __name__ == "__main__":
    run_tests()
