# Frontend Integration Guide

## Date: February 13, 2026

---

## 🎯 Critical Information for Frontend Developers

This guide explains how the frontend should interact with the backend APIs, especially regarding coordinates, IDs, and pricing.

---

## 1. Price Display - `calculated_amount` is in KOBO/CENTS!

### ⚠️ IMPORTANT: Currency Conversion

The API returns prices in **kobo** (smallest currency unit), NOT Naira!

```json
{
  "calculated_price": {
    "calculated_amount": 246900,  // ← This is 246,900 kobo
    "currency_code": "NGN"
  }
}
```

### Frontend Must Convert:
```javascript
// Backend returns kobo
const priceInKobo = 246900;

// Frontend displays Naira
const priceInNaira = priceInKobo / 100;  // = 2,469.00

// Display to user
console.log(`₦${priceInNaira.toLocaleString()}`);  // "₦2,469.00"
```

### Why Kobo?
- Avoids decimal precision errors in calculations
- Standard practice in payment systems (Stripe, Paystack use cents)
- Ensures accurate financial calculations

---

## 2. Location Input - Users Should NOT Type Coordinates!

### ❌ WRONG: User Types Coordinates
```json
{
  "pickupPoint": {
    "latitude": 6.5244,    // User shouldn't know this
    "longitude": 3.3792,   // User shouldn't type this
    "address": "10 Ogunbadewa Street Ikorodu"
  }
}
```

### ✅ CORRECT: Three Options for Frontend

#### Option 1: Google Places Autocomplete (RECOMMENDED)
```javascript
// 1. User types address
// 2. Google Places API suggests addresses
// 3. User selects from suggestions
// 4. Frontend gets complete place details

const place = await googlePlaces.getPlaceDetails(placeId);

// Send to backend
{
  "pickupPoint": {
    "latitude": place.geometry.location.lat(),
    "longitude": place.geometry.location.lng(),
    "address": place.formatted_address
  }
}
```

#### Option 2: Map Selection
```javascript
// 1. User taps on map
// 2. Frontend gets coordinates from map
// 3. Frontend calls Google Reverse Geocoding to get address

const address = await googleMaps.reverseGeocode(lat, lng);

// Send to backend
{
  "pickupPoint": {
    "latitude": lat,
    "longitude": lng,
    "address": address
  }
}
```

#### Option 3: Address Search → Backend Geocodes
```javascript
// Frontend sends only address
// Backend calls Google Geocoding API

// NOT IMPLEMENTED YET - Would require backend changes
{
  "pickupPoint": {
    "address": "10 Ogunbadewa Street Ikorodu"
    // Backend geocodes to get lat/lng
  }
}
```

### Recommended Flow:
1. Use **Google Places Autocomplete** for best UX
2. Show map with draggable pin for fine-tuning
3. Always send all three: `latitude`, `longitude`, `address`

---

## 3. Product ID & Sales Channel ID - Frontend Should Hardcode

### What Are These IDs?

#### Product ID
- Represents the service type (Ride, Food, Delivery, etc.)
- **For Ride Service**: Always use `"00000000-0000-0000-0000-000000000021"`
- This is the "Olakz Ride" product

#### Sales Channel ID
- Tracks which platform/channel the user is using
- Examples: Mobile App, Web App, Partner App
- Used for analytics and tracking

### ✅ Frontend Should Hardcode These

```javascript
// config.js or constants.js
export const RIDE_SERVICE_CONFIG = {
  productId: '00000000-0000-0000-0000-000000000021',  // Olakz Ride
  salesChannelId: 'YOUR_SALES_CHANNEL_ID',  // Get from backend team
};

// When creating cart
const createCart = async (pickupPoint) => {
  const response = await fetch('/api/ride/cart', {
    method: 'POST',
    body: JSON.stringify({
      productId: RIDE_SERVICE_CONFIG.productId,
      salesChannelId: RIDE_SERVICE_CONFIG.salesChannelId,
      pickupPoint,
    }),
  });
};
```

### How to Get Your Sales Channel ID

**Option 1: Ask Backend Team**
- They will create a sales channel for your app
- Example: "mobile-app-ios", "mobile-app-android", "web-app"

**Option 2: Call Platform Service** (if available)
```javascript
// GET /api/store/init
const storeData = await fetch('/api/store/init');
const channels = storeData.supported_sales_channels;

// Find your channel
const mobileChannel = channels.find(c => c.name === 'mobile_ride_sc');
const salesChannelId = mobileChannel.id;
```

### Why These IDs?

**Product ID Purpose:**
- Differentiates between Ride, Food, Delivery services
- Each service has different pricing, features, workflows
- Future: You might have multiple ride products (Economy, Business, etc.)

**Sales Channel ID Purpose:**
- Analytics: Track which platform generates most rides
- A/B Testing: Different features per platform
- Pricing: Potentially different prices per channel
- Commission: Different commission rates per partner

---

## 4. Complete API Flow Example

### Step 1: Create Cart (Pickup Only)

```javascript
// User selects pickup location using Google Places
const pickupPlace = await googlePlaces.getPlaceDetails(placeId);

const response = await fetch('http://localhost:3001/api/ride/cart', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    productId: '00000000-0000-0000-0000-000000000021',
    salesChannelId: 'YOUR_CHANNEL_ID',
    pickupPoint: {
      latitude: pickupPlace.geometry.location.lat(),
      longitude: pickupPlace.geometry.location.lng(),
      address: pickupPlace.formatted_address,
    },
  }),
});

const data = await response.json();
const cartId = data.data.cart.id;

// Display minimum fares (no dropoff yet)
data.data.variants.forEach(variant => {
  const priceInNaira = variant.calculated_price.calculated_amount / 100;
  console.log(`${variant.title}: ₦${priceInNaira}`);
});
```

### Step 2: Add Dropoff Location

```javascript
// User selects dropoff location
const dropoffPlace = await googlePlaces.getPlaceDetails(placeId);

const response = await fetch(`http://localhost:3001/api/carts/${cartId}/dropoff`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    dropoffPoint: {
      latitude: dropoffPlace.geometry.location.lat(),
      longitude: dropoffPlace.geometry.location.lng(),
      address: dropoffPlace.formatted_address,
    },
  }),
});

const data = await response.json();

// Display calculated fares with route info
console.log(`Distance: ${data.data.route.distanceText}`);
console.log(`Duration: ${data.data.route.durationText}`);

data.data.variants.forEach(variant => {
  const priceInNaira = variant.calculated_price.calculated_amount / 100;
  const breakdown = variant.metadata.fare_breakdown;
  
  console.log(`${variant.title}: ₦${priceInNaira}`);
  console.log(`  Base: ₦${breakdown.base_fare / 100}`);
  console.log(`  Distance: ₦${breakdown.distance_fare / 100}`);
  console.log(`  Time: ₦${breakdown.time_fare / 100}`);
});
```

### Step 3: Request Ride

```javascript
const response = await fetch('http://localhost:3001/api/ride/request', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    cartId: cartId,
    vehicleVariantId: selectedVariantId,  // User selected Standard/Premium/VIP
    pickupLocation: {
      latitude: pickupPlace.geometry.location.lat(),
      longitude: pickupPlace.geometry.location.lng(),
      address: pickupPlace.formatted_address,
    },
    dropoffLocation: {
      latitude: dropoffPlace.geometry.location.lat(),
      longitude: dropoffPlace.geometry.location.lng(),
      address: dropoffPlace.formatted_address,
    },
    // Optional: Schedule for later
    scheduledAt: '2026-02-14T10:00:00Z',
    // Optional: Book for friend
    recipient: {
      name: 'John Doe',
      phone: '+2348012345678',
    },
  }),
});
```

---

## 5. Error Handling

### Rate Limit Error (You're Seeing This)

```
ValidationError: The Express 'trust proxy' setting is true
```

**What it means:** Backend rate limiting configuration issue
**Impact:** None for now (just a warning)
**Action:** Backend team will fix this

### Google Maps Errors

If you see "REQUEST_DENIED" in logs:
- Google Maps APIs need to be enabled in Google Cloud Console
- Backend has fallback to Haversine formula (less accurate)
- Rides will still work, just with estimated distances

---

## 6. Price Breakdown Explanation

### Example Response:
```json
{
  "calculated_price": {
    "calculated_amount": 246900  // ₦2,469.00
  },
  "metadata": {
    "distance_km": 16.69,
    "duration_minutes": 30,
    "fare_breakdown": {
      "base_fare": 500,        // ₦5.00 (in kobo)
      "distance_fare": 1669,   // ₦16.69 (16.69 km × ₦100/km)
      "time_fare": 300,        // ₦3.00 (30 min × ₦10/min)
      "minimum_fare": 500      // ₦5.00
    }
  }
}
```

### Calculation:
```
Base Fare:     ₦500
Distance Fare: ₦1,669 (16.69 km × ₦100/km)
Time Fare:     ₦300 (30 min × ₦10/min)
─────────────────────
Total:         ₦2,469
```

### Display to User:
```javascript
const formatPrice = (kobo) => {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Show breakdown
console.log('Fare Breakdown:');
console.log(`Base Fare: ${formatPrice(breakdown.base_fare)}`);
console.log(`Distance (${distance_km} km): ${formatPrice(breakdown.distance_fare)}`);
console.log(`Time (${duration_minutes} min): ${formatPrice(breakdown.time_fare)}`);
console.log(`─────────────────`);
console.log(`Total: ${formatPrice(calculated_amount)}`);
```

---

## 7. Best Practices

### ✅ DO:
- Convert kobo to Naira before displaying (divide by 100)
- Use Google Places Autocomplete for address input
- Hardcode `productId` and `salesChannelId` in config
- Send all three: latitude, longitude, address
- Show fare breakdown to users
- Handle offline/error states gracefully

### ❌ DON'T:
- Display prices in kobo to users
- Ask users to type coordinates
- Ask users to type internal IDs
- Send only address without coordinates
- Assume prices are in Naira

---

## 8. Testing Checklist

- [ ] Prices display correctly in Naira (not kobo)
- [ ] Address autocomplete works
- [ ] Map selection works
- [ ] Fare breakdown shows correctly
- [ ] Multiple stops add ₦700 per waypoint
- [ ] Scheduled rides validate time (30 min - 7 days)
- [ ] Book for friend shows recipient fields
- [ ] Saved places can be selected

---

## 9. Common Issues & Solutions

### Issue: Prices look huge (246900 instead of 2469)
**Solution:** Divide by 100 before displaying

### Issue: User doesn't know coordinates
**Solution:** Use Google Places Autocomplete

### Issue: Don't know salesChannelId
**Solution:** Ask backend team or hardcode from config

### Issue: Google Maps not working
**Solution:** Backend has fallback, rides still work

---

## 10. Contact Backend Team

If you need:
- Your sales channel ID
- Different product IDs (Food, Delivery)
- API changes or new endpoints
- Help with integration

**Backend Team:** [Your contact info]

---

**Happy Coding! 🚀**
