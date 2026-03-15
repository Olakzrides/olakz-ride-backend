# Olakz Food - UI Flow Analysis & Implementation Plan

**Document Version:** 1.0  
**Created:** March 4, 2026  
**Service:** Food Ordering & Delivery Platform

---

## UI Flow Analysis (Based on Design Screenshots)

### Identified Screens & User Journey:

1. **Restaurant Listing Screen** - Browse available restaurants with food images and prices
2. **Restaurant Menu Screen** - View menu items with photos and details
3. **Location/Map Screens** - Select delivery address using map interface
4. **Address Input Screens** - Enter delivery address details
5. **Cart/Order Summary Screen** - Review order before checkout
6. **Payment Screen** - Process payment for order
7. **Order Confirmation Screen** - Success confirmation with order details
8. **Order Tracking Screen** - Real-time map tracking of delivery
9. **Order Status Updates** - Track order progress through different stages

### Core User Flow:
```
Browse Restaurants → Select Restaurant → Browse Menu → Add Items to Cart → 
Set Delivery Address → Review Order → Payment → Order Confirmation → 
Track Delivery → Order Completion
```

---

## 3-Phase Implementation Plan

### Phase 1: Restaurant Discovery & Menu Browsing
**Goal:** Enable customers to browse restaurants and menu items

**Features:**
- Browse restaurants with photos and basic info
- View restaurant details and menu
- Search and filter restaurants
- View menu items with images and prices
- Menu item details (description, options, add-ons)

**API Endpoints:**
- `GET /api/food/restaurants` - List restaurants
- `GET /api/food/restaurants/:id` - Get restaurant details
- `GET /api/food/restaurants/:id/menu` - Get restaurant menu
- `GET /api/food/menu-items/:id` - Get menu item details
- `GET /api/food/categories` - Get food categories

**Database Tables:**
- `restaurants` - Restaurant information
- `menu_items` - Food items
- `menu_categories` - Menu organization
- `menu_item_options` - Customization options (size, extras)
- `menu_item_addons` - Additional items

---

### Phase 2: Cart, Address & Order Placement
**Goal:** Enable customers to add items to cart and place orders

**Features:**
- Add items to cart with customizations
- Update cart quantities
- Remove items from cart
- Select delivery address using map
- Save delivery addresses
- Calculate delivery fee and total
- Place order with payment
- Order confirmation

**API Endpoints:**
- `POST /api/food/cart/add` - Add item to cart
- `PUT /api/food/cart/update` - Update cart item
- `DELETE /api/food/cart/remove/:id` - Remove from cart
- `GET /api/food/cart` - Get cart contents
- `POST /api/food/addresses` - Save delivery address
- `GET /api/food/addresses` - Get saved addresses
- `POST /api/food/orders/calculate` - Calculate order total
- `POST /api/food/orders` - Place order
- `GET /api/food/orders/:id` - Get order details

**Database Tables:**
- `food_carts` - Shopping cart
- `food_cart_items` - Cart items with customizations
- `food_delivery_addresses` - Saved addresses
- `food_orders` - Order records
- `food_order_items` - Order line items
- `food_order_status_history` - Order status tracking

---

### Phase 3: Order Tracking & Completion
**Goal:** Enable real-time order tracking and completion

**Features:**
- Real-time order status updates
- Track delivery on map
- View order history
- Rate restaurant and delivery
- Reorder from history
- Order notifications

**API Endpoints:**
- `GET /api/food/orders/:id/track` - Track order in real-time
- `GET /api/food/orders/:id/status` - Get order status
- `GET /api/food/orders/history` - Get order history
- `POST /api/food/orders/:id/rate` - Rate order
- `POST /api/food/orders/:id/reorder` - Reorder items
- `GET /api/food/orders/:id/receipt` - Get order receipt

**Database Tables:**
- `food_order_tracking` - Delivery tracking data
- `food_order_ratings` - Customer ratings
- `food_order_notifications` - Notification history

**WebSocket Events:**
- `order:status_update` - Order status changed
- `order:location_update` - Delivery location update
- `order:assigned` - Driver assigned to order

---

## Database Schema Overview

### Core Tables:

**Restaurants:**
- id, name, description, logo_url, cover_image_url
- address, latitude, longitude
- phone, email
- opening_hours, delivery_time
- rating, total_orders
- is_active, is_featured

**Menu Items:**
- id, restaurant_id, category_id
- name, description, image_url
- price, discount_price
- is_available, preparation_time

**Orders:**
- id, customer_id, restaurant_id
- order_number, status
- delivery_address, delivery_latitude, delivery_longitude
- subtotal, delivery_fee, service_fee, total
- payment_method, payment_status
- driver_id, estimated_delivery_time
- created_at, confirmed_at, delivered_at

---

## Technical Architecture

**Service:** Platform Service (existing)  
**Base URL:** `/api/food`  
**Authentication:** JWT (existing auth service)  
**Payment:** Flutterwave (existing integration)  
**Maps:** Google Maps API (existing integration)  
**Real-time:** WebSocket (existing socket service)

---

## Implementation Notes

1. **Leverage Existing Infrastructure:**
   - Use existing auth service for user authentication
   - Use existing payment integration (Flutterwave)
   - Use existing Google Maps integration for addresses
   - Use existing WebSocket for real-time updates
   - Use existing notification service

2. **Database Location:**
   - Add food tables to platform-service database
   - Maintain separation from ride/delivery tables

3. **Cart Management:**
   - Store cart in database (not session)
   - Allow cart persistence across sessions
   - Clear cart after successful order

4. **Order Status Flow:**
   ```
   pending → confirmed → preparing → ready → 
   picked_up → in_transit → delivered
   ```

5. **Delivery Fee Calculation:**
   - Base fee + distance-based fee
   - Consider restaurant location to delivery address
   - Apply service fee and taxes

---

## Phase Deliverables

### Phase 1 Deliverables:
- Restaurant listing and search
- Menu browsing
- Menu item details
- Category filtering

### Phase 2 Deliverables:
- Shopping cart functionality
- Address management with map
- Order calculation
- Order placement
- Payment processing

### Phase 3 Deliverables:
- Order tracking with map
- Order history
- Rating system
- Reorder functionality
- Push notifications

---

**Next Steps:**
1. Review and approve this implementation plan
2. Begin Phase 1 database schema design
3. Create API endpoint specifications
4. Start implementation

