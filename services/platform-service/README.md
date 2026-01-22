# Platform Service

The Platform Service manages the multi-service platform for Olakz, providing store initialization, service management, and usage tracking capabilities.

## Features

- **Store Initialization**: Provides homepage data including available services and advertisements
- **Service Tracking**: Tracks user service selections and usage patterns
- **Service Management**: Manages service channels, products, and regional availability
- **Analytics**: Collects usage analytics for business insights
- **Caching**: Implements intelligent caching for improved performance

## API Endpoints

### Store Endpoints

- `GET /store/init` - Get store initialization data for homepage
- `POST /services/select` - Track service selection by user
- `GET /services/context` - Get user's service context and history

### Health Check

- `GET /health` - Service health check

## Database Schema

### Core Tables

- **service_channels**: Main service categories (Ride, Food, Delivery, etc.)
- **products**: Products/sub-services within each channel
- **advertisements**: Promotional banners and ads
- **user_service_usages**: User service usage tracking
- **service_regions**: Regional service availability
- **service_analytics**: Detailed analytics events

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.template` to `.env` and configure:

```bash
cp .env.template .env
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database with initial data
npm run seed
```

### 4. Development

```bash
# Start in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Service Integration

### Gateway Integration

The platform service integrates with the API Gateway through proxy routes:

```typescript
// Gateway routes
app.use('/store', createProxyMiddleware(config.services.platform.url));
app.use('/services', createProxyMiddleware(config.services.platform.url));
```

### Authentication

The service uses optional authentication via headers set by the gateway:

- `X-User-Id`: User ID from auth service
- `X-User-Role`: User role
- `X-User-Email`: User email

## Available Services

The platform manages these service channels:

1. **mobile_ride_sc** - Olakz Ride (Transportation)
2. **mobile_delivery_sc** - Delivery Service
3. **mobile_food_sc** - Olakz Foods
4. **mobile_market_place_sc** - Market Place
5. **mobile_bill_sc** - Airtime & Data
6. **mobile_transport_hire_sc** - Transport Hire
7. **mobile_auto_wash_sc** - Auto Wash
8. **mobile_car_dealers_sc** - Car Dealers
9. **mobile_auto_mech_sc** - Auto Mechanic
10. **mobile_spare_parts_sc** - Spare Parts

## Caching Strategy

- Store initialization data is cached for 5 minutes
- Cache keys include user ID for personalized data
- Automatic cache cleanup every 5 minutes

## Rate Limiting

- Store endpoints: 30 requests per minute
- Service tracking: 10 requests per minute
- General service endpoints: 20 requests per minute

## Monitoring

### Health Check Response

```json
{
  "status": "healthy",
  "service": "platform-service",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2024-01-20T10:00:00.000Z",
  "database": "connected",
  "memory": {
    "used": 45,
    "total": 128
  }
}
```

### Logging

- All requests are logged with duration and status
- Error logging includes stack traces in development
- User actions are tracked for analytics

## Error Handling

- Graceful fallback data when database is unavailable
- Comprehensive error responses with proper HTTP status codes
- Request validation with detailed error messages

## Security

- CORS configuration for allowed origins
- Rate limiting on all endpoints
- Input validation and sanitization
- Secure headers via Helmet middleware

## Performance

- Database query optimization with proper indexes
- Connection pooling via Prisma
- Memory-based caching for frequently accessed data
- Efficient database queries with minimal N+1 problems

## Development Notes

- Uses TypeScript for type safety
- Prisma ORM for database operations
- Winston for structured logging
- Express with async error handling
- Comprehensive middleware stack