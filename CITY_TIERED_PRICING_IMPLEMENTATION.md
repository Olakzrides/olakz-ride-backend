# City-Tiered Pricing Implementation Guide

## 📋 Overview

This implementation adds **location-based pricing** to the Olakz ride platform, allowing admins to set different prices for different Nigerian states based on their economic tier (High, Middle, Low, National).

---

## 🗂️ Files Created/Modified

### **1. Nigerian States Constant**
**File:** `services/admin-service/src/constants/nigerian-states.ts`

Contains:
- Complete list of 36 Nigerian states + FCT
- State metadata (capital, geopolitical zone, code)
- Helper functions for validation and lookup
- City tier type definitions

---

### **2. Database Migration**
**File:** `services/core-logistics/prisma/migrations/20260523_city_tiered_pricing/migration.sql`

Changes:
- Adds `city_tier` column (VARCHAR)
- Adds `states` column (JSONB)
- Updates unique constraint
- Creates indexes
- Inserts national fallback configs

---

### **3. Prisma Schema Update**
**File:** `services/core-logistics/prisma/schema.prisma`

Updated `RideFareConfig` model:
```prisma
model RideFareConfig {
  id                        String   @id @default(uuid())
  vehicleCategory           String   @map("vehicle_category")
  serviceTier               String   @default("default") @map("service_tier")
  cityTier                  String   @default("national") @map("city_tier")  // NEW
  states                    Json     @default("[]") @map("states")  // NEW
  
  // ... pricing fields
}
```

---

## 📊 New Schema Structure

### **Before (Old Schema):**

```
ride_fare_config
├── id (UUID)
├── vehicle_category (VARCHAR)
├── service_tier (VARCHAR)
├── estimated_billing_unit (DECIMAL)
├── high_traffic_estimated_billing_unit (DECIMAL)
├── min_amount_less_than_3km (DECIMAL)
├── ... (other pricing fields)
└── UNIQUE(vehicle_category, service_tier)
```

**Limitation:** One price for entire Nigeria ❌

---

### **After (New Schema):**

```
ride_fare_config
├── id (UUID)
├── vehicle_category (VARCHAR)        // car, motorcycle, bicycle, bus, truck
├── service_tier (VARCHAR)            // standard, premium, vip, default
├── city_tier (VARCHAR)               // NEW: high, middle, low, national
├── states (JSONB)                    // NEW: ["Lagos", "Abuja"]
├── estimated_billing_unit (DECIMAL)
├── high_traffic_estimated_billing_unit (DECIMAL)
├── min_amount_less_than_3km (DECIMAL)
├── ... (other pricing fields)
└── UNIQUE(vehicle_category, service_tier, city_tier)
```

**Benefit:** Different prices for different states ✅

---

## 🗄️ Database Changes

### **1. New Columns Added:**

```sql
-- City pricing tier
city_tier VARCHAR(20) DEFAULT 'national'
-- Values: 'high' | 'middle' | 'low' | 'national'

-- States this config applies to
states JSONB DEFAULT '[]'
-- Example: '["Lagos", "Abuja", "FCT"]'
```

---

### **2. Unique Constraint Updated:**

```sql
-- OLD:
UNIQUE (vehicle_category, service_tier)

-- NEW:
UNIQUE (vehicle_category, service_tier, city_tier)
```

**Why:** Now you can have:
- Car/Standard/High → Lagos pricing
- Car/Standard/Middle → Rivers pricing
- Car/Standard/Low → Benue pricing
- Car/Standard/National → Fallback pricing

---

### **3. Indexes Created:**

```sql
-- For fast city tier lookups
CREATE INDEX idx_ride_fare_config_city_tier ON ride_fare_config(city_tier);

-- For fast state searches (JSONB GIN index)
CREATE INDEX idx_ride_fare_config_states ON ride_fare_config USING GIN(states);
```

---

### **4. National Fallback Configs:**

The migration creates default "national" pricing for all vehicle types:

| Vehicle | Service Tier | Price/km | Min Fare (<3km) | Service Fee |
|---------|-------------|----------|-----------------|-------------|
| Car | Standard | ₦490 | ₦3,500 | ₦500 |
| Car | Premium | ₦590 | ₦4,000 | ₦600 |
| Car | VIP | ₦790 | ₦5,000 | ₦800 |
| Motorcycle | Default | ₦350 | ₦2,000 | ₦300 |
| Bicycle | Default | ₦250 | ₦1,500 | ₦200 |
| Bus | Default | ₦400 | ₦3,000 | ₦400 |
| Truck | Default | ₦500 | ₦4,000 | ₦500 |

---

## 📝 Example Data Structure

### **High City Pricing (Lagos, Abuja):**

```json
{
  "id": "uuid-1",
  "vehicle_category": "car",
  "service_tier": "standard",
  "city_tier": "high",
  "states": ["Lagos", "Abuja", "FCT"],
  "estimated_billing_unit": 650,
  "high_traffic_estimated_billing_unit": 850,
  "min_amount_less_than_3km": 4500,
  "min_amount_for_shared_ride": 3500,
  "shared_discount_percent": 15.00,
  "service_fee": 700,
  "rounding_fee": 50,
  "booking_fee": 0,
  "fleet_commission_percent": 0,
  "is_active": true
}
```

---

### **Middle City Pricing (Port Harcourt, Ibadan):**

```json
{
  "id": "uuid-2",
  "vehicle_category": "car",
  "service_tier": "standard",
  "city_tier": "middle",
  "states": ["Rivers", "Oyo", "Kano", "Enugu"],
  "estimated_billing_unit": 500,
  "high_traffic_estimated_billing_unit": 650,
  "min_amount_less_than_3km": 3500,
  "min_amount_for_shared_ride": 2500,
  "shared_discount_percent": 20.00,
  "service_fee": 500,
  "rounding_fee": 50,
  "booking_fee": 0,
  "fleet_commission_percent": 0,
  "is_active": true
}
```

---

### **Low City Pricing (Rural areas):**

```json
{
  "id": "uuid-3",
  "vehicle_category": "car",
  "service_tier": "standard",
  "city_tier": "low",
  "states": ["Benue", "Taraba", "Nasarawa"],
  "estimated_billing_unit": 350,
  "high_traffic_estimated_billing_unit": 450,
  "min_amount_less_than_3km": 2500,
  "min_amount_for_shared_ride": 2000,
  "shared_discount_percent": 25.00,
  "service_fee": 300,
  "rounding_fee": 50,
  "booking_fee": 0,
  "fleet_commission_percent": 0,
  "is_active": true
}
```

---

### **National Fallback (Unassigned states):**

```json
{
  "id": "uuid-4",
  "vehicle_category": "car",
  "service_tier": "standard",
  "city_tier": "national",
  "states": [],
  "estimated_billing_unit": 490,
  "high_traffic_estimated_billing_unit": 650,
  "min_amount_less_than_3km": 3500,
  "min_amount_for_shared_ride": 2500,
  "shared_discount_percent": 20.00,
  "service_fee": 500,
  "rounding_fee": 50,
  "booking_fee": 0,
  "fleet_commission_percent": 0,
  "is_active": true
}
```

---

## 🎯 How It Works

### **Fare Calculation Flow:**

```
1. User requests ride (pickup: Lagos)
   ↓
2. System detects state from coordinates
   state = detectStateFromLocation(pickupLat, pickupLng)
   // Returns: "Lagos"
   ↓
3. Find city tier for state
   cityTier = getCityTierForState("Lagos")
   // Searches: states @> '["Lagos"]'
   // Returns: "high"
   ↓
4. Load fare config for city tier
   config = getFareConfig("car", "standard", "high")
   ↓
5. Calculate fare using Lagos pricing
   fare = calculateFare(config, distance)
   // Uses: ₦650/km, ₦4,500 min fare
```

---

## 📋 Nigerian States Reference

### **All 36 States + FCT:**

| State | Capital | Geo-Political Zone | Code |
|-------|---------|-------------------|------|
| Abia | Umuahia | South East | AB |
| Adamawa | Yola | North East | AD |
| Akwa Ibom | Uyo | South South | AK |
| Anambra | Awka | South East | AN |
| Bauchi | Bauchi | North East | BA |
| Bayelsa | Yenagoa | South South | BY |
| Benue | Makurdi | North Central | BE |
| Borno | Maiduguri | North East | BO |
| Cross River | Calabar | South South | CR |
| Delta | Asaba | South South | DE |
| Ebonyi | Abakaliki | South East | EB |
| Edo | Benin City | South South | ED |
| Ekiti | Ado-Ekiti | South West | EK |
| Enugu | Enugu | South East | EN |
| **FCT** | **Abuja** | **North Central** | **FC** |
| Gombe | Gombe | North East | GO |
| Imo | Owerri | South East | IM |
| Jigawa | Dutse | North West | JI |
| Kaduna | Kaduna | North West | KD |
| Kano | Kano | North West | KN |
| Katsina | Katsina | North West | KT |
| Kebbi | Birnin Kebbi | North West | KE |
| Kogi | Lokoja | North Central | KO |
| Kwara | Ilorin | North Central | KW |
| **Lagos** | **Ikeja** | **South West** | **LA** |
| Nasarawa | Lafia | North Central | NA |
| Niger | Minna | North Central | NI |
| Ogun | Abeokuta | South West | OG |
| Ondo | Akure | South West | ON |
| Osun | Osogbo | South West | OS |
| Oyo | Ibadan | South West | OY |
| Plateau | Jos | North Central | PL |
| Rivers | Port Harcourt | South South | RI |
| Sokoto | Sokoto | North West | SO |
| Taraba | Jalingo | North East | TA |
| Yobe | Damaturu | North East | YO |
| Zamfara | Gusau | North West | ZA |

---

### **Suggested City Tier Assignments:**

#### **High City (Tier 1) - 2 states:**
- Lagos
- FCT (Abuja)

**Rationale:** Highest cost of living, busiest cities

---

#### **Middle City (Tier 2) - 15 states:**
- Rivers (Port Harcourt)
- Oyo (Ibadan)
- Kano
- Enugu
- Kaduna
- Delta
- Edo
- Anambra
- Imo
- Abia
- Cross River
- Akwa Ibom
- Kwara
- Niger
- Osun

**Rationale:** Major cities, moderate economy

---

#### **Low City (Tier 3) - 20 states:**
- All remaining states (rural/developing)

**Rationale:** Lower cost of living, less busy

---

## 🚀 Next Steps

### **1. Run Migration:**

```bash
cd services/core-logistics
npx prisma migrate dev
```

---

### **2. Regenerate Prisma Client:**

```bash
npx prisma generate
```

---

### **3. Verify Migration:**

```sql
-- Check new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ride_fare_config' 
  AND column_name IN ('city_tier', 'states');

-- Check all configs
SELECT 
  vehicle_category,
  service_tier,
  city_tier,
  states,
  estimated_billing_unit
FROM ride_fare_config
ORDER BY vehicle_category, city_tier;
```

---

### **4. Next Implementation Phase:**

After this migration, you need to implement:

1. ✅ **API Endpoints** (Admin Service)
   - GET `/api/admin/pricing/states` - Get all Nigerian states
   - POST `/api/admin/pricing/city-tiers/:tier/assign-states` - Assign states to tier
   - PUT `/api/admin/pricing/:category/:tier/:cityTier` - Update pricing
   - GET `/api/admin/pricing/city-tiers` - Get all configs by tier

2. ✅ **Fare Calculation Logic** (Core Logistics)
   - Detect state from GPS coordinates
   - Find matching city tier
   - Load correct pricing config

3. ✅ **Admin Dashboard** (Frontend)
   - State selector UI
   - City tier tabs
   - Pricing forms

---

## ✅ Summary

### **What Was Done:**

✅ Created Nigerian states constant file (37 states with metadata)  
✅ Created database migration SQL  
✅ Updated Prisma schema  
✅ Added `city_tier` and `states` columns  
✅ Updated unique constraint  
✅ Created indexes for performance  
✅ Inserted national fallback configs  

### **What's Ready:**

✅ Backend state validation helpers  
✅ Database structure for city-tiered pricing  
✅ National fallback pricing for all vehicle types  

### **What's Next:**

⏳ API endpoints for state assignment  
⏳ Fare calculation with city tier detection  
⏳ Admin dashboard UI  

---

**Migration is ready to run!** 🚀
