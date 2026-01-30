# Same Database + API Boundaries Architecture Guide

## Overview
Use the same Supabase database for all services while maintaining proper microservices boundaries through API design and service contracts.

## Database Configuration (All Services)

### All Services Use Same Database URL:
```env
# Platform Service (.env)
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Core Logistics Service (.env)  
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Auth Service (.env)
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres
```

## Service Boundaries Through API Design

### 1. Data Ownership Rules

**Auth Service Owns:**
- `User` table
- `UserRole` table  
- `RefreshToken` table
- Authentication logic

**Core Logistics Service Owns:**
- `Driver` table
- `Vehicle` table
- `Ride` table
- `DriverRegistrationSession` table
- All logistics and registration logic

**Platform Service Owns:**
- `ServiceChannel` table
- `Product` table
- `Advertisement` table
- Platform configuration data

### 2. API Communication Patterns

#### ✅ CORRECT: Service-to-Service API Calls
```typescript
// In Core Logistics Service - getting user info
async getUserInfo(userId: string) {
  // Call Auth Service API (not direct DB)
  const response = await fetch(`${AUTH_SERVICE_URL}/api/users/${userId}`, {
    headers: { Authorization: `Bearer ${serviceToken}` }
  });
  return response.json();
}

// In Auth Service - checking if user is driver
async isUserDriver(userId: string) {
  // Call Core Logistics Service API (not direct DB)
  const response = await fetch(`${LOGISTICS_SERVICE_URL}/api/drivers/check/${userId}`, {
    headers: { Authorization: `Bearer ${serviceToken}` }
  });
  return response.json();
}
```

#### ❌ WRONG: Direct Database Access Across Services
```typescript
// DON'T DO THIS - Core Logistics accessing User table directly
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### 3. Service Interface Contracts

#### Auth Service API Contract
```typescript
// GET /api/users/{id} - Get user details
interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roles: string[];
  isActive: boolean;
}

// POST /api/auth/validate - Validate token
interface TokenValidationResponse {
  valid: boolean;
  user: UserResponse;
  permissions: string[];
}
```

#### Core Logistics Service API Contract
```typescript
// GET /api/drivers/{userId} - Get driver profile
interface DriverResponse {
  id: string;
  userId: string;
  licenseNumber: string;
  vehicleType: string;
  status: 'pending' | 'approved' | 'rejected';
  rating: number;
}

// POST /api/drivers/register - Register new driver
interface DriverRegistrationRequest {
  userId: string;
  vehicleType: string;
  serviceTypes: string[];
  personalInfo: PersonalInfo;
  vehicleDetails: VehicleDetails;
}
```

#### Platform Service API Contract
```typescript
// GET /api/platform/channels - Get service channels
interface ServiceChannelResponse {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  products: Product[];
}
```

## Implementation Strategy

### Phase 1: Current State (Same DB + API Boundaries)

```env
# All services use same database
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres
```

**Service Communication:**
- Gateway → Auth Service (for authentication)
- Gateway → Core Logistics (for rides, drivers)  
- Gateway → Platform Service (for platform data)
- Core Logistics ↔ Auth Service (for user validation)

### Phase 2: Future Migration (Different Schemas)

When you're ready to scale:
```env
# Each service gets its own schema
AUTH_DB_URL=postgresql://...?schema=auth
LOGISTICS_DB_URL=postgresql://...?schema=logistics  
PLATFORM_DB_URL=postgresql://...?schema=platform
```

**Migration Strategy:**
1. Create schemas
2. Move tables to appropriate schemas
3. Update Prisma configurations
4. Run migrations
5. **No API changes needed!** 🎉

## Service-to-Service Authentication

### Internal Service Tokens
```typescript
// Generate service-to-service JWT tokens
const serviceToken = jwt.sign(
  { 
    service: 'core-logistics',
    permissions: ['read:users', 'write:drivers']
  },
  SERVICE_JWT_SECRET,
  { expiresIn: '1h' }
);
```

### Service Authentication Middleware
```typescript
// Middleware to validate service-to-service calls
export const validateServiceToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['x-service-token'];
  
  try {
    const decoded = jwt.verify(token, SERVICE_JWT_SECRET);
    req.serviceContext = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
};
```

## Data Consistency Patterns

### 1. Eventual Consistency
```typescript
// When user registers, notify other services
async function createUser(userData: CreateUserRequest) {
  const user = await prisma.user.create({ data: userData });
  
  // Notify other services (async)
  await notifyServices('user.created', { userId: user.id, email: user.email });
  
  return user;
}
```

### 2. Saga Pattern for Complex Operations
```typescript
// Driver registration saga
async function registerDriver(registrationData: DriverRegistrationRequest) {
  try {
    // Step 1: Validate user exists (call Auth Service)
    const user = await authService.validateUser(registrationData.userId);
    
    // Step 2: Create driver profile
    const driver = await createDriverProfile(registrationData);
    
    // Step 3: Update user roles (call Auth Service)
    await authService.addUserRole(registrationData.userId, 'driver');
    
    return driver;
  } catch (error) {
    // Compensating actions if needed
    await rollbackDriverRegistration(registrationData);
    throw error;
  }
}
```

## Benefits of This Approach

### ✅ Immediate Benefits
- **Fast deployment** - no database restructuring needed
- **Simple operations** - single database to manage
- **Easy debugging** - all data in one place
- **Cost effective** - single Supabase project
- **Proper boundaries** - services communicate via APIs

### ✅ Future-Proof
- **Easy migration** - APIs stay the same when you split databases
- **Scalable** - can move to separate databases without code changes
- **Testable** - can mock service calls easily
- **Maintainable** - clear service contracts

## Migration Path (When Ready)

### Step 1: Add Schema Support (No Breaking Changes)
```typescript
// Update Prisma schema to support multiple schemas
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schema   = env("DB_SCHEMA") // Default to "public"
}
```

### Step 2: Create Schemas and Migrate Data
```sql
CREATE SCHEMA auth;
CREATE SCHEMA logistics;  
CREATE SCHEMA platform;

-- Move tables to appropriate schemas
ALTER TABLE "User" SET SCHEMA auth;
ALTER TABLE "Driver" SET SCHEMA logistics;
-- etc.
```

### Step 3: Update Environment Variables
```env
# Auth Service
DATABASE_URL=postgresql://...?schema=auth

# Core Logistics  
DATABASE_URL=postgresql://...?schema=logistics

# Platform Service
DATABASE_URL=postgresql://...?schema=platform
```

### Step 4: Deploy (Zero Downtime)
- APIs remain exactly the same
- Service contracts unchanged
- Client applications unaffected

## Monitoring and Observability

### Service Health Checks
```typescript
// Each service exposes health endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseConnection();
  const dependentServices = await checkDependentServices();
  
  res.json({
    status: 'healthy',
    database: dbHealth,
    dependencies: dependentServices,
    timestamp: new Date().toISOString()
  });
});
```

### Service Metrics
```typescript
// Track service-to-service calls
const serviceCallMetrics = {
  'auth-service': { calls: 0, errors: 0, avgResponseTime: 0 },
  'logistics-service': { calls: 0, errors: 0, avgResponseTime: 0 },
  'platform-service': { calls: 0, errors: 0, avgResponseTime: 0 }
};
```

## Conclusion

This approach gives you:
- **Best of both worlds**: Microservices benefits with monolith simplicity
- **Evolutionary architecture**: Start simple, evolve as needed
- **Production ready**: Deploy now, optimize later
- **Future proof**: Easy migration path when ready

You can deploy immediately with confidence! 🚀