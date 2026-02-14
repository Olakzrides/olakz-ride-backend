# Quick Reference for Frontend Developers

## 🚀 Essential Information

### 1. Price Conversion (CRITICAL!)
```javascript
// Backend returns kobo
const priceInKobo = 246900;

// Convert to Naira for display
const priceInNaira = priceInKobo / 100;  // = 2,469.00

// Display
console.log(`₦${priceInNaira.toLocaleString()}`);  // "₦2,469.00"
```

### 2. Hardcoded Configuration
```javascript
// config.js
export const RIDE_CONFIG = {
  serviceChannelId: '88eea5ae-b3ac-4a4d-ad22-84224f4c03a0',  // Ride service channel
};
```

### 3. Google Places Integration
```javascript
// Initialize autocomplete
const autocomplete = new google.maps.places.Autocomplete(inputElement);

// Get place details
autocomplete.addListener('place_changed', () => {
  const place = autocomplete.getPlace();
  
  // Extract data
  const location = {
    latitude: place.geometry.location.lat(),
    longitude: place.geometry.location.lng(),
    address: place.formatted_address,
  };
});
```

### 4. API Endpoints

#### Create Cart (Pickup Only)
```
POST /api/ride/cart
Authorization: Bearer <token>

{
  "serviceChannelId": "88eea5ae-b3ac-4a4d-ad22-84224f4c03a0",
  "pickupPoint": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "10 Ogunbadewa Street Ikorodu"
  }
}
```

#### Add Dropoff
```
PUT /api/carts/:cartId/dropoff
Authorization: Bearer <token>

{
  "dropoffPoint": {
    "latitude": 6.4281,
    "longitude": 3.4219,
    "address": "Nigerian Institute Of Medical Research"
  }
}
```

#### Request Ride
```
POST /api/ride/request
Authorization: Bearer <token>

{
  "cartId": "uuid",
  "vehicleVariantId": "uuid",
  "pickupLocation": {...},
  "dropoffLocation": {...},
  "scheduledAt": "2026-02-14T10:00:00Z",  // Optional
  "recipient": {  // Optional
    "name": "John Doe",
    "phone": "+2348012345678"
  }
}
```

### 5. Response Handling
```javascript
const response = await fetch('/api/carts/:id/dropoff', {
  method: 'PUT',
  body: JSON.stringify({ dropoffPoint }),
});

const data = await response.json();

// Extract data
const variants = data.data.variants;
const route = data.data.route;

// Display prices
variants.forEach(variant => {
  const price = variant.calculated_price.calculated_amount / 100;
  console.log(`${variant.title}: ₦${price.toFixed(2)}`);
});

// Display route
console.log(`Distance: ${route.distanceText}`);  // "16.7 km"
console.log(`Duration: ${route.durationText}`);  // "30 mins"
```

### 6. Fare Breakdown Display
```javascript
const breakdown = variant.metadata.fare_breakdown;

console.log('Fare Breakdown:');
console.log(`Base Fare: ₦${(breakdown.base_fare / 100).toFixed(2)}`);
console.log(`Distance: ₦${(breakdown.distance_fare / 100).toFixed(2)}`);
console.log(`Time: ₦${(breakdown.time_fare / 100).toFixed(2)}`);
console.log(`Total: ₦${(variant.calculated_price.calculated_amount / 100).toFixed(2)}`);
```

### 7. Vehicle Variants
```javascript
// Standard
{
  id: "00000000-0000-0000-0000-000000000031",
  title: "Standard",
  base_price: 500,  // ₦5.00
  price_per_km: 100,  // ₦1.00/km
  price_per_minute: 10  // ₦0.10/min
}

// Premium
{
  id: "00000000-0000-0000-0000-000000000032",
  title: "Premium",
  base_price: 800,  // ₦8.00
  price_per_km: 150,  // ₦1.50/km
  price_per_minute: 15  // ₦0.15/min
}

// VIP
{
  id: "00000000-0000-0000-0000-000000000033",
  title: "VIP",
  base_price: 1200,  // ₦12.00
  price_per_km: 200,  // ₦2.00/km
  price_per_minute: 20  // ₦0.20/min
}
```

### 8. Common Mistakes to Avoid

❌ **DON'T:**
- Display prices in kobo (246900)
- Ask users to type coordinates
- Ask users to type serviceChannelId
- Send only address without coordinates

✅ **DO:**
- Convert kobo to Naira (divide by 100)
- Use Google Places Autocomplete
- Hardcode serviceChannelId in config
- Send latitude, longitude, AND address

### 9. Error Handling
```javascript
try {
  const response = await fetch('/api/ride/cart', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error);
    // Show user-friendly message
    alert(error.message || 'Something went wrong');
    return;
  }
  
  const result = await response.json();
  // Handle success
} catch (error) {
  console.error('Network Error:', error);
  alert('Network error. Please check your connection.');
}
```

### 10. Testing Checklist

- [ ] Prices display in Naira (not kobo)
- [ ] Google Places Autocomplete works
- [ ] Map selection works
- [ ] Fare breakdown shows correctly
- [ ] Route distance/duration displays
- [ ] Vehicle selection works
- [ ] Ride request succeeds

---

## 📞 Need Help?

- Read: `FRONTEND_INTEGRATION_GUIDE.md` (detailed guide)
- Read: `ANSWERS_TO_YOUR_QUESTIONS.md` (Q&A)
- Read: `PHASE_1_TESTING_GUIDE.md` (API testing)

---

**Quick Reference Complete! 🎉**
