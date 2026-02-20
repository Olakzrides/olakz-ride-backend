# Olakz Delivery - UI Flow Analysis & Implementation Plan
## Comprehensive Delivery Service Implementation Strategy

**Document Version:** 1.0  
**Created:** February 18, 2026  
**Status:** Planning Phase

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [UI Flow Analysis](#ui-flow-analysis)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema Design](#database-schema-design)
5. [Implementation Phases](#implementation-phases)
6. [API Endpoints Specification](#api-endpoints-specification)
7. [Reusable Components](#reusable-components)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Plan](#deployment-plan)

---

## Executive Summary

### Project Overview
Implement a comprehensive package delivery service within the existing Olakz platform, leveraging the proven ride-hailing infrastructure while introducing delivery-specific features.

### Key Objectives
- Enable customers to send packages via multiple vehicle types (Truck, Bicycle, Bike, Car)
- Provide instant and scheduled delivery options
- Implement two-way authentication system for secure pickups and deliveries
- Support package photo documentation
- Integrate with existing payment and wallet systems
- Reuse driver/courier infrastructure with minimal modifications

### Success Criteria
- Complete end-to-end delivery flow functional
- Authentication system preventing unauthorized pickups/deliveries
- Real-time tracking for customers and couriers
- Payment integration working (Cash, Wallet, Card)
- Scheduled deliveries functioning correctly

---

## UI Flow Analysis

### Customer Journey (Sender)

#### 1. Home Screen
- Location selector
- Promotional banner (40% discount)
- **Delivery service type selector**: Truck, Bicycle, Bike, Car
- Recent delivery list with order IDs and status
- Active order tracking

#### 2. Delivery Type Selection
- **Instant Delivery**: Courier picks up immediately
- **Schedule Delivery**: Pick specific date and time

#### 3. Schedule Selection (If Scheduled)
- Calendar picker for date
- Time picker (hour, minute, AM/PM)
- Display pickup and destination locations
- Show selected delivery method

#### 4. Location Selection
- **Pickup location** input with map
- **Destination location** input with map
- Address validation
- Distance and fare calculation

#### 5. Package Details
- Package description (text field)
- **Package photo upload** (camera/gallery)
- Payment method selection (Wallet/Cash/Card)
- Recipient name
- Recipient phone number

#### 6. Confirmation Screen
- Review all details:
  - Pickup location
  - Delivery location
  - Delivery method (vehicle type)
  - Payment method and fare
  - Recipient information
  - Package photo thumbnail
- Edit details option
- Confirm button

#### 7. Payment Method Selection
- Cash option
- Wallet option
- Card option (saved cards)
- Confirm payment button

#### 8. Order Tracking
- Real-time map with courier location
- Status updates:
  - Searching for courier
  - Courier assigned
  - Courier en route to pickup
  - Courier arrived at pickup
  - Package picked up
  - En route to delivery
  - Arrived at delivery location
  - Delivered
- **Authentication code display** (for courier verification)
- Courier details (name, rating, vehicle info)
- Chat and call buttons
- Estimated delivery time

#### 9. Delivery Completion
- Success animation
- "Delivery Received" confirmation
- Rate courier button
- Home button

#### 10. Delivery History
- List of past deliveries
- Filter by status (In progress, Completed, Cancelled)
- Order details view
- Pickup and delivery photos

### Courier Journey (Rider)

#### 1. Dashboard
- Online/Offline toggle
- Map showing available delivery requests
- Scheduled deliveries counter
- Today's earnings display
- Delivery request notifications

#### 2. Delivery Request
- Delivery details card:
  - Customer name and payment method
  - Pickup location
  - Dropoff location
  - Estimated distance and time
  - Fare amount
- Accept/Reject buttons

#### 3. Navigate to Pickup
- GPS navigation to pickup location
- Customer contact buttons (chat/call)
- "Arrived at pickup" button

#### 4. Pickup Verification
- **Authentication code display** (courier receives code)
- "Give code to sender to confirm pickup" instruction
- Code confirmation button
- Package photo capture (optional)

#### 5. Start Delivery
- "Start Delivery" button after code confirmation
- Route displayed on map
- Customer details visible

#### 6. Navigate to Delivery
- GPS navigation to dropoff location
- Recipient contact buttons
- "Arrived at delivery" button

#### 7. Delivery Verification
- **Authentication code input modal**
- "Enter recipient's authentication code" instruction
- Code input field
- Confirm button
- Delivery photo capture (optional)

#### 8. Delivery Confirmation
- Success screen: "Authentication Confirmed"
- "Package received" message
- Return to dashboard button
- Earnings updated

---

## Technical Architecture

### System Components

#### 1. Existing Infrastructure (Reuse)
- Authentication service
- Payment service (Wallet, Cards, Flutterwave)
- Notification service (FCM)
- Driver/Courier management
- Location tracking
- Real-time updates (WebSocket)
- Rating system

#### 2. New Components (Build)
- Delivery order management
- Authentication code generation/validation
- Package photo storage
- Delivery-specific fare calculation
- Scheduled delivery management

### Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│              (https://olakzride.duckdns.org)            │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼──────┐  ┌────────▼────────┐
│  Auth Service  │  │   Payment   │  │   Notification  │
│   (Existing)   │  │   Service   │  │    Service      │
└────────────────┘  │  (Existing) │  │   (Existing)    │
                    └─────────────┘  └─────────────────┘
                            │
                    ┌───────▼────────┐
                    │ Core Logistics │
                    │    Service     │
                    │                │
                    │  ┌──────────┐  │
                    │  │ Delivery │  │
                    │  │  Module  │  │
                    │  └──────────┘  │
                    │                │
                    │  ┌──────────┐  │
                    │  │   Ride   │  │
                    │  │  Module  │  │
                    │  └──────────┘  │
                    └────────────────┘
```

### Data Flow

#### Customer Creates Delivery Order
```
Customer App → API Gateway → Core Logistics Service
  → Create Delivery Order
  → Generate Authentication Codes (pickup & delivery)
  → Calculate Fare
  → Hold Payment (if wallet/card)
  → Match with Available Courier
  → Send Notification to Courier
```

#### Courier Accepts & Completes Delivery
```
Courier App → Accept Order → Navigate to Pickup
  → Verify Pickup Code → Capture Photo (optional)
  → Start Delivery → Navigate to Dropoff
  → Verify Delivery Code → Capture Photo (optional)
  → Complete Order → Process Payment
  → Update Earnings → Send Notifications
```

---


## Database Schema Design

### New Tables Required

#### 1. `deliveries` Table
```sql
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(20) UNIQUE NOT NULL, -- e.g., "ORDB1234"
  
  -- Customer & Recipient
  customer_id UUID NOT NULL REFERENCES users(id),
  recipient_name VARCHAR(255) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  
  -- Locations
  pickup_latitude DECIMAL(10, 8) NOT NULL,
  pickup_longitude DECIMAL(11, 8) NOT NULL,
  pickup_address TEXT NOT NULL,
  dropoff_latitude DECIMAL(10, 8) NOT NULL,
  dropoff_longitude DECIMAL(11, 8) NOT NULL,
  dropoff_address TEXT NOT NULL,
  
  -- Package Details
  package_description TEXT,
  package_photo_url TEXT,
  
  -- Delivery Details
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  delivery_type VARCHAR(20) NOT NULL, -- 'instant' or 'scheduled'
  scheduled_pickup_at TIMESTAMP,
  
  -- Courier Assignment
  courier_id UUID REFERENCES drivers(id),
  assigned_at TIMESTAMP,
  
  -- Authentication Codes
  pickup_code VARCHAR(20) NOT NULL UNIQUE,
  delivery_code VARCHAR(20) NOT NULL UNIQUE,
  pickup_code_verified_at TIMESTAMP,
  delivery_code_verified_at TIMESTAMP,
  
  -- Status Tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending', 
  -- pending, searching, assigned, courier_enroute_pickup, 
  -- arrived_pickup, picked_up, enroute_delivery, 
  -- arrived_delivery, delivered, cancelled
  
  -- Timestamps for each status
  searching_at TIMESTAMP,
  courier_arrived_pickup_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  courier_arrived_delivery_at TIMESTAMP,
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Pricing
  estimated_fare DECIMAL(10, 2) NOT NULL,
  final_fare DECIMAL(10, 2),
  currency_code VARCHAR(3) DEFAULT 'NGN',
  distance_km DECIMAL(10, 2),
  
  -- Payment
  payment_method VARCHAR(20) NOT NULL, -- 'cash', 'wallet', 'card'
  payment_status VARCHAR(20) DEFAULT 'pending', -- pending, held, completed, refunded
  payment_id UUID,
  
  -- Proof of Delivery
  pickup_photo_url TEXT,
  delivery_photo_url TEXT,
  
  -- Metadata
  region_id UUID REFERENCES regions(id),
  metadata JSONB DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_deliveries_customer (customer_id),
  INDEX idx_deliveries_courier (courier_id),
  INDEX idx_deliveries_status (status),
  INDEX idx_deliveries_order_number (order_number),
  INDEX idx_deliveries_pickup_code (pickup_code),
  INDEX idx_deliveries_delivery_code (delivery_code),
  INDEX idx_deliveries_scheduled (scheduled_pickup_at) WHERE delivery_type = 'scheduled'
);
```

#### 2. `delivery_status_history` Table
```sql
CREATE TABLE delivery_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  location_latitude DECIMAL(10, 8),
  location_longitude DECIMAL(11, 8),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_delivery_status_history_delivery (delivery_id),
  INDEX idx_delivery_status_history_created_at (created_at)
);
```

#### 3. `delivery_fare_config` Table
```sql
CREATE TABLE delivery_fare_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  region_id UUID NOT NULL REFERENCES regions(id),
  
  -- Pricing
  base_fare DECIMAL(10, 2) NOT NULL,
  price_per_km DECIMAL(10, 2) NOT NULL,
  minimum_fare DECIMAL(10, 2) NOT NULL,
  
  -- Scheduled delivery surcharge
  scheduled_delivery_surcharge DECIMAL(10, 2) DEFAULT 0,
  
  -- Time-based pricing (optional)
  peak_hour_multiplier DECIMAL(3, 2) DEFAULT 1.0,
  
  currency_code VARCHAR(3) DEFAULT 'NGN',
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(vehicle_type_id, region_id)
);
```

### Modified Tables

#### Update `drivers` table (if needed)
```sql
-- Add delivery service capability flag
ALTER TABLE drivers 
ADD COLUMN can_do_deliveries BOOLEAN DEFAULT true,
ADD COLUMN delivery_rating DECIMAL(3, 2) DEFAULT 0,
ADD COLUMN total_deliveries INTEGER DEFAULT 0;
```

#### Update `vehicle_types` table
```sql
-- Ensure vehicle types support delivery service
-- Truck, Bicycle, Bike, Car should have delivery service enabled
UPDATE vehicle_types 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'), 
  '{supports_delivery}', 
  'true'
)
WHERE name IN ('truck', 'bicycle', 'bike', 'car');
```

---

## Implementation Phases

### Phase 1: Core Delivery Infrastructure (Week 1-2)
**Goal:** Establish basic delivery order creation and management

#### Database Setup
- [ ] Create `deliveries` table with all fields
- [ ] Create `delivery_status_history` table
- [ ] Create `delivery_fare_config` table
- [ ] Add delivery-related fields to `drivers` table
- [ ] Update `vehicle_types` for delivery support
- [ ] Create database indexes for performance
- [ ] Seed initial fare configuration data

#### Authentication Code System
- [ ] Create `AuthCodeService` for generating unique codes
  - Format: `GB1-A12-123` (3 segments, alphanumeric)
  - Ensure uniqueness across all active deliveries
  - Expiration logic (codes expire after delivery completion)
- [ ] Implement code verification logic
- [ ] Add code validation endpoints

#### Basic Delivery Order Management
- [ ] Create `DeliveryService` class
  - `createDelivery()` - Create new delivery order
  - `getDelivery()` - Get delivery by ID
  - `updateDeliveryStatus()` - Update status with history
  - `cancelDelivery()` - Cancel delivery order
- [ ] Create `DeliveryController` class
  - POST `/api/delivery/create` - Create delivery
  - GET `/api/delivery/:id` - Get delivery details
  - PUT `/api/delivery/:id/status` - Update status
  - POST `/api/delivery/:id/cancel` - Cancel delivery
- [ ] Implement delivery status state machine
- [ ] Add status history tracking

#### Fare Calculation
- [ ] Create `DeliveryFareService` class
  - Calculate fare based on distance and vehicle type
  - Apply scheduled delivery surcharge
  - Handle minimum fare logic
- [ ] Implement fare estimation endpoint
- [ ] Add fare configuration management

#### Testing
- [ ] Unit tests for AuthCodeService
- [ ] Unit tests for DeliveryService
- [ ] Unit tests for DeliveryFareService
- [ ] Integration tests for delivery creation flow
- [ ] Test fare calculations with various scenarios

**Deliverables:**
- Database schema deployed
- Basic delivery CRUD operations working
- Authentication code generation functional
- Fare calculation accurate

---

### Phase 2: Customer Delivery Flow (Week 3-4)
**Goal:** Complete customer-facing delivery booking experience

#### Vehicle Type Selection
- [ ] Add delivery service channel configuration
- [ ] Create endpoint to get available vehicle types for delivery
- [ ] Filter vehicle types by region and availability

#### Delivery Type Selection (Instant vs Scheduled)
- [ ] Implement instant delivery logic
- [ ] Implement scheduled delivery logic
  - Date/time picker validation
  - Minimum advance booking time (e.g., 1 hour)
  - Maximum advance booking time (e.g., 7 days)
- [ ] Add scheduled delivery surcharge calculation

#### Location & Package Details
- [ ] Create delivery order creation endpoint
  - POST `/api/delivery/order` - Full order creation
  - Validate pickup and dropoff locations
  - Validate recipient information
  - Generate authentication codes
  - Calculate and return fare
- [ ] Implement package photo upload
  - Use existing storage service (Supabase)
  - Validate image format and size
  - Generate secure URLs
- [ ] Add recipient information validation

#### Payment Integration
- [ ] Integrate with existing payment service
  - Wallet payment hold
  - Card payment processing
  - Cash payment tracking
- [ ] Implement payment hold for wallet/card
- [ ] Add payment completion on delivery
- [ ] Handle payment refunds for cancellations

#### Order Confirmation
- [ ] Create confirmation endpoint with all details
- [ ] Generate order number (ORDB1234 format)
- [ ] Send confirmation notification to customer
- [ ] Return authentication codes to customer

#### Testing
- [ ] End-to-end test: Create delivery order
- [ ] Test scheduled delivery validation
- [ ] Test payment hold and release
- [ ] Test photo upload functionality
- [ ] Test order confirmation flow

**Deliverables:**
- Complete customer order creation flow
- Payment integration working
- Photo upload functional
- Order confirmation with codes

---

### Phase 3: Courier Matching & Pickup (Week 5-6)
**Goal:** Enable courier assignment and pickup verification

#### Courier Matching System
- [ ] Create `DeliveryMatchingService` class
  - Find available couriers near pickup location
  - Filter by vehicle type
  - Consider courier ratings and acceptance rate
  - Implement matching algorithm (similar to ride matching)
- [ ] Add delivery request notification to couriers
- [ ] Implement courier acceptance/rejection logic
- [ ] Handle timeout and re-matching if no acceptance

#### Courier Assignment
- [ ] Create courier assignment endpoints
  - POST `/api/delivery/:id/assign` - Assign courier
  - POST `/api/delivery/:id/accept` - Courier accepts
  - POST `/api/delivery/:id/reject` - Courier rejects
- [ ] Update delivery status on assignment
- [ ] Send notifications to customer on assignment
- [ ] Provide courier details to customer

#### Navigation to Pickup
- [ ] Implement courier location tracking
  - Reuse existing driver location service
  - Update location in real-time
- [ ] Add "arrived at pickup" endpoint
  - POST `/api/delivery/:id/arrived-pickup`
  - Update status and timestamp
  - Notify customer

#### Pickup Verification
- [ ] Create pickup code verification endpoint
  - POST `/api/delivery/:id/verify-pickup`
  - Validate pickup code
  - Update status to "picked_up"
  - Record verification timestamp
- [ ] Implement pickup photo upload (optional)
  - POST `/api/delivery/:id/pickup-photo`
  - Store photo URL in database
- [ ] Send pickup confirmation to customer

#### Testing
- [ ] Test courier matching algorithm
- [ ] Test courier acceptance flow
- [ ] Test pickup code verification
- [ ] Test pickup photo upload
- [ ] End-to-end test: Order to pickup

**Deliverables:**
- Courier matching functional
- Pickup verification working
- Real-time location tracking active
- Pickup photos stored

---

### Phase 4: Delivery Completion & Tracking (Week 7-8)
**Goal:** Complete delivery flow with verification and tracking

#### Real-time Tracking
- [ ] Implement delivery tracking endpoints
  - GET `/api/delivery/:id/track` - Get current status and location
  - WebSocket events for real-time updates
- [ ] Add status update notifications
  - Courier en route to delivery
  - Courier arrived at delivery
  - Delivery completed
- [ ] Implement ETA calculation

#### Navigation to Delivery
- [ ] Add "arrived at delivery" endpoint
  - POST `/api/delivery/:id/arrived-delivery`
  - Update status and timestamp
  - Notify recipient

#### Delivery Verification
- [ ] Create delivery code verification endpoint
  - POST `/api/delivery/:id/verify-delivery`
  - Validate delivery code from recipient
  - Update status to "delivered"
  - Record verification timestamp
  - Trigger payment completion
- [ ] Implement delivery photo upload (optional)
  - POST `/api/delivery/:id/delivery-photo`
  - Store photo URL as proof of delivery
- [ ] Send delivery confirmation to customer and recipient

#### Payment Completion
- [ ] Process final payment on delivery
  - Release wallet hold
  - Complete card transaction
  - Record cash payment
- [ ] Update courier earnings
- [ ] Generate receipt/invoice

#### Rating System
- [ ] Implement courier rating for deliveries
  - POST `/api/delivery/:id/rate`
  - Store rating (1-5 stars)
  - Update courier delivery rating
- [ ] Add feedback/comments option

#### Testing
- [ ] Test delivery code verification
- [ ] Test payment completion flow
- [ ] Test delivery photo upload
- [ ] Test rating system
- [ ] End-to-end test: Complete delivery flow

**Deliverables:**
- Delivery verification working
- Payment completion functional
- Rating system active
- Complete end-to-end flow tested

---

### Phase 5: History, Analytics & Polish (Week 9-10)
**Goal:** Add delivery history, analytics, and final polish

#### Delivery History
- [ ] Create delivery history endpoints
  - GET `/api/delivery/history` - Customer delivery history
  - GET `/api/delivery/courier-history` - Courier delivery history
  - Add filtering (status, date range, vehicle type)
  - Add pagination
- [ ] Implement delivery details view
  - Show complete delivery information
  - Display pickup and delivery photos
  - Show timeline of status changes

#### Courier Dashboard
- [ ] Add delivery-specific dashboard metrics
  - Total deliveries completed
  - Delivery earnings
  - Delivery rating
  - Acceptance rate
- [ ] Implement delivery request list
  - Show nearby delivery requests
  - Filter by vehicle type
  - Sort by distance/fare

#### Scheduled Deliveries
- [ ] Create scheduled delivery management
  - GET `/api/delivery/scheduled` - List scheduled deliveries
  - Implement reminder notifications
  - Auto-start matching at scheduled time
- [ ] Add scheduled delivery cancellation
  - Handle refunds for cancellations
  - Apply cancellation fees if applicable

#### Analytics & Reporting
- [ ] Add delivery analytics endpoints
  - Delivery volume by vehicle type
  - Average delivery time
  - Popular routes
  - Revenue metrics
- [ ] Create admin dashboard data

#### Error Handling & Edge Cases
- [ ] Handle courier no-show scenarios
- [ ] Implement delivery timeout logic
- [ ] Add support for delivery issues
  - Package damaged
  - Recipient unavailable
  - Wrong address
- [ ] Implement dispute resolution flow

#### Performance Optimization
- [ ] Add database query optimization
- [ ] Implement caching for fare configs
- [ ] Optimize courier matching algorithm
- [ ] Add rate limiting for delivery creation

#### Testing & QA
- [ ] Comprehensive integration testing
- [ ] Load testing for concurrent deliveries
- [ ] Security testing for authentication codes
- [ ] User acceptance testing

**Deliverables:**
- Delivery history functional
- Scheduled deliveries working
- Analytics available
- All edge cases handled
- Production-ready system

---


## API Endpoints Specification

### Customer Endpoints

#### 1. Create Delivery Order
```
POST /api/delivery/order
Authorization: Bearer <token>

Request Body:
{
  "vehicleTypeId": "uuid",
  "deliveryType": "instant" | "scheduled",
  "scheduledPickupAt": "2026-02-20T14:00:00Z", // if scheduled
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "32 Samwell Sq, Chevron"
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219,
    "address": "21b, Karimu Kotun Street, Victoria Island"
  },
  "packageDescription": "Documents in envelope",
  "packagePhotoUrl": "https://storage.url/photo.jpg", // optional
  "recipientName": "Richard Daniel",
  "recipientPhone": "+2348012345678",
  "paymentMethod": {
    "type": "wallet" | "cash" | "card",
    "cardId": "uuid" // if card
  }
}

Response:
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB1234",
      "pickupCode": "GB1-A12-123",
      "deliveryCode": "GB1-B34-456",
      "estimatedFare": 8000,
      "currency": "NGN",
      "status": "pending",
      "createdAt": "2026-02-18T10:00:00Z"
    }
  }
}
```

#### 2. Get Delivery Status
```
GET /api/delivery/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB1234",
      "status": "picked_up",
      "pickupLocation": {...},
      "dropoffLocation": {...},
      "courier": {
        "id": "uuid",
        "name": "John Courier",
        "phone": "+234801****678",
        "rating": 4.8,
        "vehicle": {
          "type": "car",
          "plateNumber": "ABC-123-XY",
          "color": "Black"
        },
        "currentLocation": {
          "latitude": 6.5100,
          "longitude": 3.3800
        }
      },
      "estimatedDeliveryTime": "2026-02-18T11:30:00Z",
      "pickupCode": "GB1-A12-123",
      "deliveryCode": "GB1-B34-456",
      "packagePhoto": "https://storage.url/photo.jpg",
      "pickupPhoto": "https://storage.url/pickup.jpg",
      "deliveryPhoto": "https://storage.url/delivery.jpg"
    }
  }
}
```

#### 3. Track Delivery (Real-time)
```
GET /api/delivery/:id/track
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "status": "enroute_delivery",
    "courierLocation": {
      "latitude": 6.5100,
      "longitude": 3.3800,
      "heading": 45,
      "speed": 30
    },
    "estimatedArrival": "2026-02-18T11:30:00Z",
    "distanceRemaining": 5.2,
    "lastUpdated": "2026-02-18T11:15:00Z"
  }
}
```

#### 4. Cancel Delivery
```
POST /api/delivery/:id/cancel
Authorization: Bearer <token>

Request Body:
{
  "reason": "Changed my mind"
}

Response:
{
  "success": true,
  "data": {
    "message": "Delivery cancelled successfully",
    "refundAmount": 8000,
    "cancellationFee": 0
  }
}
```

#### 5. Rate Courier
```
POST /api/delivery/:id/rate
Authorization: Bearer <token>

Request Body:
{
  "rating": 5,
  "feedback": "Great service, very professional"
}

Response:
{
  "success": true,
  "data": {
    "message": "Courier rated successfully"
  }
}
```

#### 6. Get Delivery History
```
GET /api/delivery/history?limit=20&status=completed
Authorization: Bearer <token>

Query Parameters:
- limit: Number of deliveries (default: 20)
- offset: Pagination offset (default: 0)
- status: Filter by status (optional)
- startDate: Filter from date (optional)
- endDate: Filter to date (optional)

Response:
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB1234",
        "status": "delivered",
        "pickupAddress": "32 Samwell Sq, Chevron",
        "dropoffAddress": "21b, Karimu Kotun Street",
        "recipientName": "Richard Daniel",
        "finalFare": 8000,
        "deliveredAt": "2026-02-18T11:45:00Z",
        "courier": {
          "name": "John Courier",
          "rating": 4.8
        }
      }
    ],
    "total": 50,
    "limit": 20,
    "offset": 0
  }
}
```

#### 7. Upload Package Photo
```
POST /api/delivery/upload-photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- photo: File (image)

Response:
{
  "success": true,
  "data": {
    "photoUrl": "https://storage.url/photo.jpg"
  }
}
```

### Courier Endpoints

#### 1. Get Available Delivery Requests
```
GET /api/delivery/courier/available?vehicleType=car&radius=10
Authorization: Bearer <token>

Query Parameters:
- vehicleType: Filter by vehicle type (optional)
- radius: Search radius in km (default: 10)
- limit: Number of requests (default: 10)

Response:
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB1234",
        "pickupLocation": {...},
        "dropoffLocation": {...},
        "distance": 12.5,
        "estimatedFare": 8000,
        "paymentMethod": "cash",
        "packageDescription": "Documents",
        "scheduledPickupAt": null,
        "createdAt": "2026-02-18T10:00:00Z"
      }
    ],
    "total": 5
  }
}
```

#### 2. Accept Delivery Request
```
POST /api/delivery/:id/accept
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB1234",
      "pickupLocation": {...},
      "dropoffLocation": {...},
      "customer": {
        "name": "Jane Customer",
        "phone": "+234801****123"
      },
      "recipientName": "Richard Daniel",
      "recipientPhone": "+234801****678",
      "packageDescription": "Documents",
      "estimatedFare": 8000
    },
    "message": "Delivery accepted successfully"
  }
}
```

#### 3. Reject Delivery Request
```
POST /api/delivery/:id/reject
Authorization: Bearer <token>

Request Body:
{
  "reason": "Too far from current location"
}

Response:
{
  "success": true,
  "data": {
    "message": "Delivery rejected"
  }
}
```

#### 4. Update Status - Arrived at Pickup
```
POST /api/delivery/:id/arrived-pickup
Authorization: Bearer <token>

Request Body:
{
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}

Response:
{
  "success": true,
  "data": {
    "pickupCode": "GB1-A12-123",
    "message": "Arrived at pickup location"
  }
}
```

#### 5. Verify Pickup Code
```
POST /api/delivery/:id/verify-pickup
Authorization: Bearer <token>

Request Body:
{
  "pickupCode": "GB1-A12-123"
}

Response:
{
  "success": true,
  "data": {
    "message": "Pickup verified successfully",
    "deliveryCode": "GB1-B34-456",
    "recipientName": "Richard Daniel",
    "recipientPhone": "+234801****678",
    "dropoffLocation": {...}
  }
}

Error Response (Invalid Code):
{
  "success": false,
  "error": "Invalid pickup code",
  "code": "INVALID_PICKUP_CODE"
}
```

#### 6. Upload Pickup Photo
```
POST /api/delivery/:id/pickup-photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- photo: File (image)

Response:
{
  "success": true,
  "data": {
    "photoUrl": "https://storage.url/pickup.jpg",
    "message": "Pickup photo uploaded"
  }
}
```

#### 7. Start Delivery
```
POST /api/delivery/:id/start-delivery
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "message": "Delivery started",
    "dropoffLocation": {...},
    "estimatedArrival": "2026-02-18T11:30:00Z"
  }
}
```

#### 8. Update Status - Arrived at Delivery
```
POST /api/delivery/:id/arrived-delivery
Authorization: Bearer <token>

Request Body:
{
  "location": {
    "latitude": 6.4281,
    "longitude": 3.4219
  }
}

Response:
{
  "success": true,
  "data": {
    "message": "Arrived at delivery location",
    "recipientName": "Richard Daniel",
    "recipientPhone": "+234801****678"
  }
}
```

#### 9. Verify Delivery Code
```
POST /api/delivery/:id/verify-delivery
Authorization: Bearer <token>

Request Body:
{
  "deliveryCode": "GB1-B34-456"
}

Response:
{
  "success": true,
  "data": {
    "message": "Delivery completed successfully",
    "finalFare": 8000,
    "earnings": 7200,
    "paymentMethod": "cash"
  }
}

Error Response (Invalid Code):
{
  "success": false,
  "error": "Invalid delivery code",
  "code": "INVALID_DELIVERY_CODE"
}
```

#### 10. Upload Delivery Photo
```
POST /api/delivery/:id/delivery-photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- photo: File (image)

Response:
{
  "success": true,
  "data": {
    "photoUrl": "https://storage.url/delivery.jpg",
    "message": "Delivery photo uploaded"
  }
}
```

#### 11. Get Courier Delivery History
```
GET /api/delivery/courier/history?limit=20&status=delivered
Authorization: Bearer <token>

Query Parameters:
- limit: Number of deliveries (default: 20)
- offset: Pagination offset (default: 0)
- status: Filter by status (optional)
- startDate: Filter from date (optional)
- endDate: Filter to date (optional)

Response:
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB1234",
        "status": "delivered",
        "pickupAddress": "32 Samwell Sq, Chevron",
        "dropoffAddress": "21b, Karimu Kotun Street",
        "distance": 12.5,
        "earnings": 7200,
        "deliveredAt": "2026-02-18T11:45:00Z",
        "rating": 5
      }
    ],
    "total": 150,
    "totalEarnings": 1080000
  }
}
```

#### 12. Get Scheduled Deliveries
```
GET /api/delivery/courier/scheduled
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB1235",
        "scheduledPickupAt": "2026-02-19T14:00:00Z",
        "pickupLocation": {...},
        "dropoffLocation": {...},
        "estimatedFare": 10000
      }
    ],
    "total": 3
  }
}
```

### Admin Endpoints

#### 1. Get Delivery Analytics
```
GET /api/admin/delivery/analytics?startDate=2026-02-01&endDate=2026-02-18
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "data": {
    "totalDeliveries": 1250,
    "completedDeliveries": 1100,
    "cancelledDeliveries": 150,
    "totalRevenue": 10000000,
    "averageDeliveryTime": 45,
    "byVehicleType": {
      "car": 600,
      "bike": 400,
      "bicycle": 150,
      "truck": 100
    },
    "byPaymentMethod": {
      "cash": 500,
      "wallet": 600,
      "card": 150
    }
  }
}
```

#### 2. Update Fare Configuration
```
PUT /api/admin/delivery/fare-config
Authorization: Bearer <admin_token>

Request Body:
{
  "vehicleTypeId": "uuid",
  "regionId": "uuid",
  "baseFare": 500,
  "pricePerKm": 100,
  "minimumFare": 300,
  "scheduledDeliverySurcharge": 200
}

Response:
{
  "success": true,
  "data": {
    "message": "Fare configuration updated successfully"
  }
}
```

---


## Reusable Components from Ride Service

### 1. Authentication & Authorization
- **Reuse:** Complete auth service
- **Usage:** JWT token validation, user authentication
- **No changes needed**

### 2. Payment Processing
- **Reuse:** Payment service, wallet service, card management
- **Usage:** 
  - Wallet holds and releases
  - Card payments via Flutterwave
  - Cash payment tracking
- **Minor changes:** Add delivery-specific payment metadata

### 3. Location Services
- **Reuse:** Driver location tracking, GPS utilities
- **Usage:**
  - Real-time courier location updates
  - Distance calculations
  - Route optimization
- **No changes needed**

### 4. Notification System
- **Reuse:** FCM push notifications, notification service
- **Usage:**
  - Delivery status updates
  - Courier assignment notifications
  - Delivery completion alerts
- **Minor changes:** Add delivery-specific notification templates

### 5. Rating System
- **Reuse:** Rating service
- **Usage:** Rate couriers after delivery
- **Minor changes:** Separate delivery ratings from ride ratings

### 6. File Storage
- **Reuse:** Supabase storage service
- **Usage:**
  - Package photos
  - Pickup proof photos
  - Delivery proof photos
- **No changes needed**

### 7. Real-time Updates
- **Reuse:** WebSocket service
- **Usage:**
  - Live delivery tracking
  - Status change notifications
  - Courier location updates
- **Minor changes:** Add delivery-specific event types

### 8. Driver/Courier Management
- **Reuse:** Driver service, availability service
- **Usage:**
  - Courier profiles
  - Online/offline status
  - Earnings tracking
- **Minor changes:** Add delivery-specific metrics

### 9. Region & Fare Management
- **Reuse:** Region service
- **Usage:** Determine service area and currency
- **New component:** Delivery fare service (separate from ride fares)

### 10. Support System
- **Reuse:** WhatsApp support integration
- **Usage:** Customer support for delivery issues
- **Minor changes:** Add delivery-specific issue categories

---

## Testing Strategy

### Unit Testing

#### Services to Test
1. **AuthCodeService**
   - Code generation uniqueness
   - Code format validation
   - Code expiration logic

2. **DeliveryService**
   - Order creation
   - Status updates
   - Cancellation logic

3. **DeliveryFareService**
   - Fare calculations
   - Scheduled delivery surcharge
   - Minimum fare enforcement

4. **DeliveryMatchingService**
   - Courier matching algorithm
   - Distance-based filtering
   - Vehicle type matching

### Integration Testing

#### Critical Flows
1. **Complete Delivery Flow**
   - Create order → Match courier → Pickup → Delivery → Payment
   - Test with all payment methods
   - Test with all vehicle types

2. **Scheduled Delivery Flow**
   - Create scheduled order
   - Verify matching starts at scheduled time
   - Test reminder notifications

3. **Authentication Code Flow**
   - Generate codes
   - Verify pickup code
   - Verify delivery code
   - Test invalid code scenarios

4. **Payment Flow**
   - Wallet hold and release
   - Card payment processing
   - Cash payment tracking
   - Refund on cancellation

### End-to-End Testing

#### Customer Journey
- [ ] Select vehicle type
- [ ] Choose delivery type (instant/scheduled)
- [ ] Enter locations and package details
- [ ] Upload package photo
- [ ] Select payment method
- [ ] Confirm order
- [ ] Track delivery in real-time
- [ ] Receive delivery
- [ ] Rate courier

#### Courier Journey
- [ ] View available deliveries
- [ ] Accept delivery request
- [ ] Navigate to pickup
- [ ] Verify pickup code
- [ ] Upload pickup photo
- [ ] Navigate to delivery
- [ ] Verify delivery code
- [ ] Upload delivery photo
- [ ] Complete delivery

### Performance Testing

#### Load Testing Scenarios
1. **Concurrent Order Creation**
   - 100 simultaneous order creations
   - Verify code uniqueness
   - Check database performance

2. **Courier Matching**
   - 50 concurrent matching requests
   - Verify no duplicate assignments
   - Check response times

3. **Real-time Tracking**
   - 200 active deliveries with location updates
   - Verify WebSocket performance
   - Check database load

### Security Testing

#### Authentication Code Security
- [ ] Test code guessing attacks
- [ ] Verify code expiration
- [ ] Test rate limiting on verification attempts
- [ ] Ensure codes are unique and unpredictable

#### Payment Security
- [ ] Test payment hold authorization
- [ ] Verify refund processing
- [ ] Test double-payment prevention
- [ ] Ensure PCI compliance for card data

---

## Deployment Plan

### Pre-Deployment Checklist

#### Database
- [ ] Run database migrations on staging
- [ ] Seed fare configuration data
- [ ] Create database backups
- [ ] Verify indexes are created
- [ ] Test database performance

#### Code Deployment
- [ ] Merge all feature branches
- [ ] Run full test suite
- [ ] Build production artifacts
- [ ] Update environment variables
- [ ] Deploy to staging environment

#### Configuration
- [ ] Update fare configurations
- [ ] Configure vehicle types for delivery
- [ ] Set up notification templates
- [ ] Configure file storage buckets
- [ ] Update API gateway routes

#### Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Configure performance monitoring
- [ ] Set up delivery-specific alerts
- [ ] Create monitoring dashboards

### Deployment Steps

#### Phase 1: Staging Deployment
1. Deploy database migrations
2. Deploy backend services
3. Update API gateway configuration
4. Run smoke tests
5. Perform UAT (User Acceptance Testing)

#### Phase 2: Production Deployment
1. Schedule maintenance window (if needed)
2. Create database backup
3. Deploy database migrations
4. Deploy backend services (zero-downtime)
5. Update API gateway
6. Monitor error rates and performance
7. Verify critical flows working

#### Phase 3: Gradual Rollout
1. Enable for internal testing (10% of users)
2. Monitor for 24 hours
3. Increase to 25% of users
4. Monitor for 48 hours
5. Increase to 50% of users
6. Monitor for 72 hours
7. Full rollout (100% of users)

### Rollback Plan

#### Triggers for Rollback
- Error rate > 5%
- Payment failures > 2%
- Database performance degradation
- Critical bug discovered

#### Rollback Steps
1. Revert API gateway configuration
2. Rollback backend services
3. Revert database migrations (if safe)
4. Notify stakeholders
5. Investigate and fix issues
6. Prepare for re-deployment

### Post-Deployment

#### Monitoring (First 48 Hours)
- [ ] Monitor error rates every hour
- [ ] Check payment success rates
- [ ] Verify courier matching working
- [ ] Monitor database performance
- [ ] Track API response times
- [ ] Review user feedback

#### Week 1 Review
- [ ] Analyze delivery completion rates
- [ ] Review courier acceptance rates
- [ ] Check payment processing success
- [ ] Identify and fix minor bugs
- [ ] Optimize slow queries
- [ ] Gather user feedback

#### Week 2-4 Optimization
- [ ] Optimize courier matching algorithm
- [ ] Improve fare calculation performance
- [ ] Add missing features based on feedback
- [ ] Enhance error handling
- [ ] Improve notification timing

---

## Future Enhancements (Post-MVP)

### Phase 6: Additional Features (Later)

#### 1. Notifications Enhancement
- Push notification preferences
- SMS notifications for key events
- Email receipts and confirmations
- In-app notification center

#### 2. Navigation Menu
- Comprehensive side menu
- Quick access to key features
- Profile management
- Settings and preferences

#### 3. Multi-Order Dashboard
- Unified view of rides and deliveries
- Filter by service type
- Sort by date, status, fare
- Search functionality

#### 4. Order Filtering & Search
- Advanced filters (date range, status, vehicle type)
- Search by order number
- Search by recipient name
- Export order history

#### 5. Trip History Enhancement
- Detailed trip timeline
- Map view of completed trips
- Download receipts/invoices
- Share trip details

#### 6. Order Details Enhancement
- Comprehensive order view
- Full status timeline
- All photos in gallery view
- Contact support from order
- Reorder functionality

#### 7. Package Categories
- Document delivery
- Food delivery
- Parcel delivery
- Fragile items
- Category-specific pricing

#### 8. Delivery Insurance
- Optional insurance for valuable packages
- Insurance pricing based on declared value
- Claims process

#### 9. Multi-Stop Deliveries
- Pick up from multiple locations
- Deliver to multiple recipients
- Optimized route planning
- Bulk delivery discounts

#### 10. Delivery Scheduling Enhancements
- Recurring deliveries
- Delivery time windows
- Priority delivery options
- Same-day vs next-day pricing

---

## Key Metrics & KPIs

### Operational Metrics
- **Delivery Completion Rate**: Target > 95%
- **Average Delivery Time**: Target < 60 minutes
- **Courier Acceptance Rate**: Target > 80%
- **On-Time Delivery Rate**: Target > 90%
- **Authentication Success Rate**: Target > 99%

### Business Metrics
- **Daily Delivery Volume**: Track growth
- **Revenue per Delivery**: Monitor profitability
- **Customer Retention Rate**: Target > 70%
- **Courier Utilization Rate**: Target > 60%
- **Average Order Value**: Track trends

### Quality Metrics
- **Customer Rating**: Target > 4.5/5
- **Courier Rating**: Target > 4.5/5
- **Complaint Rate**: Target < 2%
- **Cancellation Rate**: Target < 5%
- **Payment Success Rate**: Target > 98%

### Technical Metrics
- **API Response Time**: Target < 500ms (p95)
- **Error Rate**: Target < 1%
- **Database Query Time**: Target < 100ms (p95)
- **WebSocket Connection Stability**: Target > 99%
- **Photo Upload Success Rate**: Target > 99%

---

## Risk Assessment & Mitigation

### Technical Risks

#### 1. Authentication Code Collisions
**Risk:** Duplicate codes generated  
**Impact:** High - Security breach  
**Mitigation:**
- Use cryptographically secure random generation
- Check uniqueness before saving
- Add database unique constraint
- Monitor for collisions

#### 2. Payment Processing Failures
**Risk:** Payment holds not released  
**Impact:** High - Customer dissatisfaction  
**Mitigation:**
- Implement automatic refund on failure
- Add payment reconciliation job
- Monitor payment success rates
- Provide manual refund process

#### 3. Courier Matching Failures
**Risk:** No couriers available  
**Impact:** Medium - Poor customer experience  
**Mitigation:**
- Expand search radius automatically
- Notify more couriers
- Offer incentives for acceptance
- Provide estimated wait time

#### 4. Database Performance
**Risk:** Slow queries under load  
**Impact:** Medium - Poor user experience  
**Mitigation:**
- Add proper indexes
- Implement caching
- Use read replicas
- Monitor query performance

### Business Risks

#### 1. Low Courier Adoption
**Risk:** Couriers don't accept deliveries  
**Impact:** High - Service failure  
**Mitigation:**
- Competitive pricing for couriers
- Incentives for early adopters
- Training and onboarding
- Monitor acceptance rates

#### 2. Customer Confusion
**Risk:** Users don't understand authentication codes  
**Impact:** Medium - Support burden  
**Mitigation:**
- Clear UI instructions
- In-app tutorials
- Support documentation
- Proactive customer support

#### 3. Fraud & Abuse
**Risk:** Fake deliveries, code sharing  
**Impact:** High - Financial loss  
**Mitigation:**
- Photo verification required
- Monitor suspicious patterns
- Implement fraud detection
- Manual review for high-value deliveries

---

## Success Criteria

### MVP Launch Success
- [ ] 100 successful deliveries in first week
- [ ] < 5% cancellation rate
- [ ] > 90% authentication success rate
- [ ] > 95% payment success rate
- [ ] < 2% error rate
- [ ] Average customer rating > 4.0
- [ ] Average courier rating > 4.0

### Month 1 Success
- [ ] 1,000+ completed deliveries
- [ ] 50+ active couriers
- [ ] 200+ active customers
- [ ] Revenue target achieved
- [ ] < 3% complaint rate
- [ ] > 85% courier acceptance rate

### Month 3 Success
- [ ] 10,000+ completed deliveries
- [ ] 200+ active couriers
- [ ] 1,000+ active customers
- [ ] Profitability achieved
- [ ] All vehicle types utilized
- [ ] Scheduled deliveries > 20% of volume

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building the Olakz Delivery service. By leveraging existing infrastructure and following a phased approach, we can deliver a robust, secure, and scalable delivery platform.

### Key Takeaways
1. **Reuse extensively** - 70% of infrastructure already exists
2. **Focus on core flow** - Authentication codes are the key differentiator
3. **Phased rollout** - Minimize risk with gradual deployment
4. **Monitor closely** - Track metrics from day one
5. **Iterate quickly** - Gather feedback and improve continuously

### Next Steps
1. Review and approve this implementation plan
2. Set up development environment
3. Begin Phase 1: Core Delivery Infrastructure
4. Schedule regular progress reviews
5. Prepare for MVP launch

---

**Document Status:** Ready for Review  
**Estimated Timeline:** 10 weeks to MVP  
**Team Size Required:** 2-3 backend developers  
**Dependencies:** Existing ride service infrastructure

