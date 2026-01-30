const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/driver-registration';

// Mock JWT token for testing (you'll need a real one from auth service)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4LTkwYWItY2RlZi0xMjM0LTU2Nzg5MGFiY2RlZiIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTczODA3NzYwMCwiZXhwIjoxNzM4MTY0MDAwfQ.test';

const headers = {
  'Content-Type': 'application/json'
  // Removed Authorization header for testing
};

async function testPhase2API() {
  try {
    console.log('🚀 Testing Phase 2 Multi-Step Registration API...\n');

    // Test 1: Get vehicle types (public endpoint)
    console.log('1. Testing GET /vehicle-types (public)');
    try {
      const response = await axios.get(`${BASE_URL}/vehicle-types`);
      console.log('✅ Vehicle types retrieved successfully');
      console.log(`   Found ${response.data.data.vehicle_types.length} vehicle types`);
    } catch (error) {
      console.log('❌ Failed to get vehicle types:', error.response?.data || error.message);
    }

    // Test 2: Initiate registration
    console.log('\n2. Testing POST /register/initiate');
    let registrationId;
    try {
      const response = await axios.post(`${BASE_URL}/register/initiate`, {
        vehicle_type: 'car',
        service_types: ['ride', 'delivery']
      }, { headers });
      
      console.log('✅ Registration initiated successfully');
      console.log(`   Registration ID: ${response.data.data.registration_id}`);
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   Progress: ${response.data.data.progress_percentage}%`);
      console.log(`   Current step: ${response.data.data.current_step}`);
      
      registrationId = response.data.data.registration_id;
    } catch (error) {
      console.log('❌ Failed to initiate registration:', error.response?.data || error.message);
      return;
    }

    // Test 3: Submit personal info
    console.log('\n3. Testing POST /register/{id}/personal-info');
    try {
      const response = await axios.post(`${BASE_URL}/register/${registrationId}/personal-info`, {
        first_name: 'John',
        last_name: 'Doe',
        phone: '+1234567890',
        date_of_birth: '1990-01-01',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        postal_code: '10001'
      }, { headers });
      
      console.log('✅ Personal info submitted successfully');
      console.log(`   Progress: ${response.data.data.progress_percentage}%`);
      console.log(`   Current step: ${response.data.data.current_step}`);
    } catch (error) {
      console.log('❌ Failed to submit personal info:', error.response?.data || error.message);
    }

    // Test 4: Submit vehicle details
    console.log('\n4. Testing POST /register/{id}/vehicle-details');
    try {
      const response = await axios.post(`${BASE_URL}/register/${registrationId}/vehicle-details`, {
        plate_number: 'ABC123',
        manufacturer: 'Toyota',
        model: 'Camry',
        year: 2020,
        color: 'Blue'
      }, { headers });
      
      console.log('✅ Vehicle details submitted successfully');
      console.log(`   Progress: ${response.data.data.progress_percentage}%`);
      console.log(`   Current step: ${response.data.data.current_step}`);
      console.log(`   Required documents: ${response.data.data.required_documents.length}`);
    } catch (error) {
      console.log('❌ Failed to submit vehicle details:', error.response?.data || error.message);
    }

    // Test 5: Upload documents
    console.log('\n5. Testing POST /register/{id}/documents');
    try {
      const response = await axios.post(`${BASE_URL}/register/${registrationId}/documents`, {
        documents: [
          {
            type: 'driver_license',
            url: 'https://storage.example.com/license.jpg',
            filename: 'license.jpg'
          },
          {
            type: 'vehicle_registration',
            url: 'https://storage.example.com/registration.jpg',
            filename: 'registration.jpg'
          }
        ]
      }, { headers });
      
      console.log('✅ Documents uploaded successfully');
      console.log(`   Progress: ${response.data.data.progress_percentage}%`);
      console.log(`   Current step: ${response.data.data.current_step}`);
    } catch (error) {
      console.log('❌ Failed to upload documents:', error.response?.data || error.message);
    }

    // Test 6: Get registration status
    console.log('\n6. Testing GET /register/{id}/status');
    try {
      const response = await axios.get(`${BASE_URL}/register/${registrationId}/status`, { headers });
      
      console.log('✅ Registration status retrieved successfully');
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   Progress: ${response.data.data.progress_percentage}%`);
      console.log(`   Current step: ${response.data.data.current_step}`);
      console.log(`   Vehicle type: ${response.data.data.vehicle_type}`);
      console.log(`   Service types: ${response.data.data.service_types.join(', ')}`);
    } catch (error) {
      console.log('❌ Failed to get registration status:', error.response?.data || error.message);
    }

    // Test 7: Submit registration
    console.log('\n7. Testing POST /register/{id}/submit');
    try {
      const response = await axios.post(`${BASE_URL}/register/${registrationId}/submit`, {}, { headers });
      
      console.log('✅ Registration submitted successfully');
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   Progress: ${response.data.data.progress_percentage}%`);
      console.log(`   Message: ${response.data.data.message}`);
    } catch (error) {
      console.log('❌ Failed to submit registration:', error.response?.data || error.message);
    }

    // Test 8: Resume registration (should find no active session now)
    console.log('\n8. Testing POST /register/resume');
    try {
      const response = await axios.post(`${BASE_URL}/register/resume`, {}, { headers });
      
      console.log('✅ Resume registration response:');
      console.log(`   Registration ID: ${response.data.data.registration_id}`);
      console.log(`   Status: ${response.data.data.status}`);
    } catch (error) {
      console.log('❌ Resume registration failed (expected - no active session):', error.response?.data?.error || error.message);
    }

    console.log('\n🎉 Phase 2 API testing completed!');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

testPhase2API();