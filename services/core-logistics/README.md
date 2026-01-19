# Core Logistics Service

Phase 1 implementation of the ride booking and management service for Olakz Ride platform.

## Features (Phase 1)

- ✅ Ride cart creation with pickup location
- ✅ Dropoff location selection
- ✅ Multiple ride variants (Standard, Premium, VIP)
- ✅ Dynamic fare calculation
- ✅ Ride request creation
- ✅ Payment hold system (wallet-based)
- ✅ Ride history and status tracking
- ✅ Driver rating system

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Authentication**: JWT

## Project Structure

```
services/core-logistics/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Database migrations
│   └── seed.ts                # Seed data
├── src/
│   ├── config/                # Configuration files
│   ├── controllers/           # Request handlers
│   ├── services/              # Business logic
│   ├── routes/                # API routes
│   ├── middleware/            # Express middleware
│   ├── types/                 # TypeScript types
│   ├── utils/                 # Utility functions
│   ├── app.ts                 # Express app setup
│   └── index.ts               # Entry point
├── .env                       # Environment variables
├── Dockerfile                 # Docker configuration
└── package.json               # Dependencies
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.template` to `.env` and update with your credentials:

```bash
cp .env.template .env
```

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

### 4. Run Migrations

```bash
npm run prisma:migrate:dev
```

### 5. Seed Database

```bash
npm run prisma:seed
```

This creates:
- 1 Region (Lagos, Nigeria)
- 3 Vehicle Types (Standard, Premium, VIP)
- 1 Ride Product (Olakz Ride)
- 3 Ride Variants with pricing

## Development

### Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### Build for Production

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run typecheck
```

## API Endpoints

### Public Endpoints

```
GET  /health                    # Health check
GET  /api/variants              # Get all ride variants
GET  /api/products/:handle      # Get ride product by handle
GET  /api/variants/:variantId   # Get variant details
```

### Protected Endpoints (Require Authentication)

#### Cart Management
```
POST /api/ride/cart             # Create ride cart
PUT  /api/carts/:cartId/dropoff # Add dropoff location
POST /api/carts/:cartId/line-items # Select ride variant
GET  /api/carts/:cartId         # Get cart details
```

#### Ride Management
```
POST /api/ride/request          # Request ride
GET  /api/ride/:rideId/status   # Get ride status
GET  /api/ride/:rideId          # Get ride details
POST /api/ride/:rideId/cancel   # Cancel ride
GET  /api/ride/history          # Get ride history
POST /api/ride/:rideId/rating   # Rate driver
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Get the token from the Auth Service (`/api/auth/login`).

## Database Schema

### Core Tables (Phase 1)

1. **regions** - Geographic regions with currency info
2. **vehicle_types** - Vehicle categories (Standard, Premium, VIP)
3. **ride_products** - Service offerings
4. **ride_variants** - Pricing tiers
5. **ride_carts** - User booking carts
6. **cart_line_items** - Selected variants
7. **rides** - Actual ride records
8. **wallet_transactions** - Payment transactions

## Example Usage

### 1. Create Ride Cart

```bash
POST /api/ride/cart
Authorization: Bearer <token>

{
  "productId": "00000000-0000-0000-0000-000000000021",
  "salesChannelId": "mobile_ride_sc",
  "passengers": 1,
  "searchRadius": 10,
  "pickupPoint": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  }
}
```

### 2. Add Dropoff Location

```bash
PUT /api/carts/:cartId/dropoff
Authorization: Bearer <token>

{
  "dropoffPoint": {
    "latitude": 6.4474,
    "longitude": 3.3903,
    "address": "Ikeja, Lagos"
  }
}
```

### 3. Select Ride Variant

```bash
POST /api/carts/:cartId/line-items
Authorization: Bearer <token>

{
  "variantId": "00000000-0000-0000-0000-000000000031",
  "quantity": 1
}
```

### 4. Request Ride

```bash
POST /api/ride/request
Authorization: Bearer <token>

{
  "cartId": "<cart-id>",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.4474,
    "longitude": 3.3903,
    "address": "Ikeja, Lagos"
  },
  "vehicleVariantId": "00000000-0000-0000-0000-000000000031",
  "paymentMethod": {
    "type": "wallet"
  }
}
```

## Phase 1 Limitations

- ❌ No real-time driver tracking (Socket.IO)
- ❌ No driver matching algorithm
- ❌ No actual Google Maps integration (uses mock data)
- ❌ No surge pricing
- ❌ No multiple stops/waypoints
- ❌ No driver management

These features will be implemented in Phase 2-4.

## Testing

```bash
npm test                # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

## Docker

### Build Image

```bash
docker build -t olakz-core-logistics .
```

### Run Container

```bash
docker run -p 3001:3001 --env-file .env olakz-core-logistics
```

## Environment Variables

See `.env.template` for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT verification
- `PORT` - Server port (default: 3001)
- `USE_MOCK_MAPS` - Use mock distance/duration (Phase 1)

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
npm run prisma:studio
```

### Migration Issues

```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Re-run migrations
npm run prisma:migrate:dev

# Re-seed
npm run prisma:seed
```

### Build Errors

```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

## Next Steps (Phase 2)

- Driver profile management
- Driver vehicle registration
- Driver document verification
- Driver online/offline status
- Basic driver location updates

## Support

For issues or questions, contact the development team.

## License

ISC
