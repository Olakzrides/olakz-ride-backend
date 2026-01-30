# Database Setup Guide for Production Deployment

## Current Setup Analysis
You're currently using:
```
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres
```

## Recommended Production Database Configuration

### Option 1: Same Supabase Project, Different Schemas (RECOMMENDED)

#### Server Environment Files:

**Platform Service (.env)**
```env
NODE_ENV=production
PORT=3003
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?schema=platform
JWT_SECRET=your-super-secure-jwt-secret-platform
```

**Core Logistics Service (.env)**
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?schema=logistics
JWT_SECRET=your-super-secure-jwt-secret-logistics
SUPABASE_URL=https://ijlrjelstivyhttufraq.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

**Auth Service (.env)**
```env
NODE_ENV=production
PORT=3002
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?schema=auth
JWT_SECRET=your-super-secure-jwt-secret-auth
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key
```

**Gateway (.env)**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secure-jwt-secret-gateway
AUTH_SERVICE_URL=http://localhost:3002
CORE_LOGISTICS_SERVICE_URL=http://localhost:3001
PLATFORM_SERVICE_URL=http://localhost:3003
CORS_ORIGIN=https://your-frontend-domain.com
```

## Database Schema Setup

### Step 1: Update Prisma Schema Files

**Platform Service (services/platform-service/prisma/schema.prisma)**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schema   = "platform"
}

// Your existing platform models...
```

**Core Logistics Service (services/core-logistics/prisma/schema.prisma)**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schema   = "logistics"
}

// Your existing logistics models...
```

**Auth Service (services/auth-service/prisma/schema.prisma)**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schema   = "auth"
}

// Your existing auth models...
```

### Step 2: Create Schemas in Supabase

Connect to your Supabase database and run:

```sql
-- Create schemas
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS logistics;
CREATE SCHEMA IF NOT EXISTS auth;

-- Grant permissions
GRANT USAGE ON SCHEMA platform TO postgres;
GRANT USAGE ON SCHEMA logistics TO postgres;
GRANT USAGE ON SCHEMA auth TO postgres;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA platform TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA logistics TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO postgres;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA platform TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA logistics TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO postgres;
```

### Step 3: Run Migrations for Each Service

```bash
# Platform Service
cd services/platform-service
npx prisma migrate deploy
npx prisma generate

# Core Logistics Service
cd ../core-logistics
npx prisma migrate deploy
npx prisma generate

# Auth Service
cd ../auth-service
npx prisma migrate deploy
npx prisma generate
```

## Alternative: Separate Supabase Projects

If you prefer complete isolation, create separate Supabase projects:

1. **Go to Supabase Dashboard**
2. **Create New Projects:**
   - `olakz-auth-service`
   - `olakz-core-logistics`
   - Keep existing for platform service

3. **Update Environment Variables:**
```env
# Auth Service
DATABASE_URL=postgresql://postgres.newprojectid1:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Core Logistics Service  
DATABASE_URL=postgresql://postgres.newprojectid2:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Platform Service (existing)
DATABASE_URL=postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres
```

## Deployment Steps

### 1. Local Testing with New Schema Setup
```bash
# Update local .env files with schema parameters
# Test each service individually
npm run dev
```

### 2. Server Deployment
```bash
# On your server, update .env files for each service
# Run migrations
cd services/platform-service && npx prisma migrate deploy
cd ../core-logistics && npx prisma migrate deploy  
cd ../auth-service && npx prisma migrate deploy
```

### 3. Verify Database Separation
```bash
# Check each service connects to its own schema
curl http://localhost:3003/health  # Platform
curl http://localhost:3001/health  # Logistics
curl http://localhost:3002/health  # Auth
```

## Benefits of This Setup

✅ **Data Isolation**: Each service owns its data  
✅ **Independent Scaling**: Scale databases per service needs  
✅ **Security**: Limited access scope per service  
✅ **Maintenance**: Independent backups and migrations  
✅ **Cost Effective**: Single Supabase project with schemas  
✅ **Easy Management**: All in one Supabase dashboard  

## Security Considerations

1. **Different JWT Secrets**: Each service should have unique JWT secrets
2. **Schema Permissions**: Ensure services can only access their schemas
3. **Connection Pooling**: Supavisor handles this automatically
4. **Backup Strategy**: Regular backups of entire database

## Monitoring

```sql
-- Check schema usage
SELECT schemaname, tablename, tableowner 
FROM pg_tables 
WHERE schemaname IN ('platform', 'logistics', 'auth');

-- Check connections per schema
SELECT datname, usename, application_name, state 
FROM pg_stat_activity 
WHERE datname = 'postgres';
```

This setup gives you proper microservices architecture while keeping management simple with a single Supabase project.