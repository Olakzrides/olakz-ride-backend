# Olakz Ride - Backend Services

A comprehensive ride-hailing platform backend built with Node.js, TypeScript, and microservices architecture.

## 🏗️ Architecture

This is a **monorepo** containing multiple microservices:

- **API Gateway** (Port 3000) - Request routing, CORS, rate limiting
- **Core Logistics Service** (Port 3001) - Ride management, driver operations, real-time features
- **Auth Service** (Port 3003) - User authentication and authorization
- **Platform Service** (Port 3004) - Store management and platform features
- **Payment Service** (Port 3002) - Payment processing (Stripe, Paystack)

## ✨ Features Implemented

### Phase 1: Core Ride Booking ✅
- User registration and authentication (JWT, OTP, OAuth)
- Ride cart and variant management
- Fare calculation with multiple pricing tiers
- Payment processing with wallet system
- Multi-role support (customer, driver, admin)

### Phase 2A: Driver Operations ✅
- Driver registration with comprehensive validation
- Document upload and verification (Supabase Storage)
- Multi-vehicle type support (car, motorcycle, bicycle, truck, bus)
- Service tier assignment (Standard, Premium, VIP)
- Driver availability management (online/offline)
- Ride acceptance and lifecycle management
- Driver and passenger rating system
- Admin approval workflow

### Phase 2B: Real-Time & Notifications ✅
- **Socket.IO real-time communication**
- **Push notifications (Firebase Cloud Messaging)**
- **Multi-driver ride broadcasting**
- **Intelligent driver matching algorithm**
- **Real-time location tracking**
- **First-to-accept wins logic**
- **Automatic timeout and retry mechanism**
- **Device token management**
- **Notification preferences**
- **Notification history**

### Phase 3: Production Features 🚧
- Trip receipts (PDF generation, email)
- Emergency features (SOS, trip sharing)
- Driver earnings tracking and payouts
- Promo codes and discounts
- Analytics dashboard

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm
- Supabase account
- Postman (for API testing)

### 1. Clone Repository
```bash
git clone <repository-url>
cd olakz-ride-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
# Copy environment templates
cp services/auth-service/.env.template services/auth-service/.env
cp services/core-logistics/.env.template services/core-logistics/.env
cp gateway/.env.template gateway/.env

# Update with your Supabase credentials
```

### 4. Database Setup
```bash
# Run migrations
cd services/auth-service && npx prisma migrate deploy
cd ../core-logistics && npx prisma migrate deploy

# Generate Prisma clients
cd services/auth-service && npx prisma generate
cd ../core-logistics && npx prisma generate

# Seed database
cd services/core-logistics && npm run seed
```

### 5. Start Services
```bash
# Terminal 1: Auth Service
cd services/auth-service && npm run dev

# Terminal 2: Core Logistics Service
cd services/core-logistics && npm run dev

# Terminal 3: API Gateway
cd gateway && npm run dev
```

### 6. Test the API
Import `Olakz_Ride_Logistics.postman_collection.json` into Postman and start testing!

## 📊 Service Details

### Auth Service (Port 3003)
- JWT-based authentication
- Multi-role support (customer, driver, admin)
- OTP verification
- Refresh token management

### Core Logistics Service (Port 3001)
- Ride booking and management
- Driver matching with intelligent ranking
- Real-time Socket.IO communication
- Location tracking
- Payment processing

### API Gateway (Port 3000)
- Request routing to microservices
- Rate limiting
- CORS handling
- Request/response logging

## 🔧 Development

### Project Structure
```
olakz-ride-backend/
├── services/
│   ├── auth-service/          # Authentication microservice
│   └── core-logistics/        # Main logistics microservice
├── gateway/                   # API Gateway
├── docs/                      # Documentation
├── scripts/                   # Utility scripts
└── package.json              # Root package.json
```

### Available Scripts
```bash
# Root level
npm run dev          # Start all services
npm run build        # Build all services
npm run test         # Run all tests

# Individual services
npm run dev:auth     # Start auth service only
npm run dev:logistics # Start logistics service only
npm run dev:gateway  # Start gateway only
```

### Database Migrations
```bash
# Create new migration
cd services/[service-name]
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

## 🧪 Testing

### API Testing
1. Import Postman collection (if available)
2. Set up environment variables
3. Follow testing guides:
   - [Phase 2B Testing Guide](PHASE_2B_TESTING_GUIDE.md) - Complete testing workflow
   - [Frontend API Documentation](FRONTEND_API_DOCUMENTATION.md) - All endpoints

### Real-Time Features Testing
- **Socket.IO**: Use [Socket.IO Client Tool](https://amritb.github.io/socketio-client-tool/)
- **Push Notifications**: Requires real mobile device with Firebase SDK
- **Driver Matching**: Test with multiple driver accounts

### Running Tests
```bash
# Auth service tests
cd services/auth-service
npm test

# Core logistics tests
cd services/core-logistics
npm test
```

## 🔐 Security

- JWT tokens with refresh mechanism
- Role-based access control
- Input validation and sanitization
- Rate limiting
- CORS protection
- Environment variable protection

## 📚 Documentation

### Essential Guides
- **[Quick Start Guide](QUICK_START.md)** - Get started in 5 minutes
- **[Team Setup Guide](TEAM_SETUP_GUIDE.md)** - Onboarding for new developers
- **[Database Setup Guide](DATABASE_SETUP_GUIDE.md)** - Database configuration
- **[Firebase Setup Guide](FIREBASE_SETUP_GUIDE.md)** - Push notifications setup
- **[Deployment Checklist](DEPLOYMENT_CHECKLIST.md)** - Production deployment

### API Documentation
- **[Frontend API Documentation](FRONTEND_API_DOCUMENTATION.md)** - Complete API reference
- **[Driver & Admin API Guide](DRIVER_AND_ADMIN_API_GUIDE.md)** - Driver and admin endpoints
- **[Passenger Ride Booking Flow](PASSENGER_RIDE_BOOKING_FLOW.md)** - Passenger journey
- **[Phase 2B Testing Guide](PHASE_2B_TESTING_GUIDE.md)** - Real-time features testing

### Architecture Docs
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [API Reference](docs/API.md)
- [Setup Instructions](docs/SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🚀 Deployment

The application is designed to be deployed on:
- **Development**: Local environment
- **Staging**: Docker containers
- **Production**: Cloud platforms (AWS, GCP, Azure)

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## 📞 Support

For support and questions:
- Create an issue in this repository
- Check the documentation in `/docs`
- Review the Postman collection for API examples

---

**Built with ❤️ for the future of transportation**