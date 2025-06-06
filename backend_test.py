
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
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

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
            self.run_test(
                f"Calculate Route - {city.capitalize()}", 
                "POST", 
                "route/calculate", 
                data={
                    "start": coords["start"],
                    "end": coords["end"],
                    "city": city
                }
            )

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
    
    # Print summary
    tester.print_summary()
    
    return tester.tests_passed == tester.tests_run

if __name__ == "__main__":
    run_tests()
