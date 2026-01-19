# Olakz Ride - Backend Services

A comprehensive ride-hailing platform backend built with Node.js, TypeScript, and microservices architecture.

## 🏗️ Architecture

This is a **monorepo** containing multiple microservices:

- **Auth Service** (Port 3003) - User authentication and authorization
- **Core Logistics Service** (Port 3001) - Ride management, driver matching, real-time features
- **API Gateway** (Port 3000) - Request routing and load balancing

## ✨ Features Implemented

### Phase 1: Core Ride Booking ✅
- User registration and authentication
- Ride cart and variant management
- Basic fare calculation
- Payment processing (wallet system)

### Phase 2: Driver Management ✅
- Driver registration and approval workflow
- Multi-vehicle type support (car, bike, bicycle, truck, bus)
- Document upload and verification (Supabase Storage)
- Role-based access control (customer/driver/admin)

### Phase 3: Real-time Features ✅
- **Socket.IO real-time communication**
- **Multi-driver ride broadcasting** (Bolt/Lyft model)
- **Intelligent driver matching algorithm**
- **Real-time location tracking**
- **First-to-accept wins logic**
- **30-second timeout handling**

### Phase 4: Advanced Features 🚧
- Google Maps API integration
- Surge pricing algorithms
- Multiple stops/waypoints
- Driver earnings & payouts
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

### Real-time Features Testing
The project includes Socket.IO testing tools:
- Postman collection with all API endpoints
- Comprehensive testing guides in `/docs`

### API Testing
1. Import Postman collection
2. Set up environment variables
3. Follow the testing sequence in the collection

## 🔐 Security

- JWT tokens with refresh mechanism
- Role-based access control
- Input validation and sanitization
- Rate limiting
- CORS protection
- Environment variable protection

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Setup Instructions](docs/SETUP.md)
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