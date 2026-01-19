# Setup Guide

Complete guide to setting up the Olakz Ride Backend for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **npm** >= 9.0.0 (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **Docker & Docker Compose** (optional, for containerized development) ([Download](https://www.docker.com/))

### Required Accounts

You'll need accounts for the following services:

1. **Supabase** - PostgreSQL database ([Sign up](https://supabase.com/))
2. **ZeptoMail** - Email service ([Sign up](https://www.zoho.com/zeptomail/))
3. **Google Cloud Console** - For OAuth (optional) ([Console](https://console.cloud.google.com/))

---

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd olakz-ride-backend
```

---

## Step 2: Run Setup Script

The setup script will create `.env` files from templates and generate a JWT secret:

```bash
node scripts/setup.js
```

This will:
- Create `.env` files in gateway and auth-service directories
- Generate a secure JWT secret
- Display configuration instructions

---

## Step 3: Configure Supabase Database

### 3.1 Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Click "New Project"
3. Fill in project details:
   - Name: `olakz-ride-backend`
   - Database Password: (save this securely)
   - Region: Choose closest to you
4. Wait for project to be created (~2 minutes)

### 3.2 Get Database Credentials

1. Go to **Project Settings** > **Database**
2. Scroll to **Connection String** section
3. Copy the **URI** format connection string
4. Replace `[YOUR-PASSWORD]` with your database password

Example:
```
postgresql://postgres:your-password@db.abc123xyz.supabase.co:5432/postgres
```

### 3.3 Get Supabase API Keys

1. Go to **Project Settings** > **API**
2. Copy:
   - **Project URL** (e.g., `https://abc123xyz.supabase.co`)
   - **anon public** key
   - **service_role** key (optional, for admin operations)

---

## Step 4: Configure Environment Variables

### 4.1 Auth Service Configuration

Edit `services/auth-service/.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.YOUR-PROJECT-REF.supabase.co:5432/postgres

# Supabase
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# JWT (use the generated secret from setup script)
JWT_SECRET=your-generated-jwt-secret-here
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Email Service (ZeptoMail)
ZEPTO_SMTP_HOST=smtp.zeptomail.com
ZEPTO_SMTP_PORT=587
ZEPTO_SMTP_USER=emailapikey
ZEPTO_SMTP_PASS=your-zepto-password-here
ZEPTO_FROM_EMAIL=noreply@yourdomain.com
ZEPTO_FROM_NAME=Olakz Ride

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3003/api/auth/google/callback

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:19006

# Other settings (defaults are fine)
NODE_ENV=development
PORT=3003
LOG_LEVEL=info
```

### 4.2 Gateway Configuration

Edit `gateway/.env`:

```bash
NODE_ENV=development
PORT=3000

# Service URLs (defaults are fine for local development)
AUTH_SERVICE_URL=http://localhost:3003
LOGISTICS_SERVICE_URL=http://localhost:3001
PAYMENT_SERVICE_URL=http://localhost:3002

# CORS (add your frontend URLs)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:19006

# Rate limiting (defaults are fine)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

---

## Step 5: Configure Email Service (ZeptoMail)

### 5.1 Create ZeptoMail Account

1. Go to [ZeptoMail](https://www.zoho.com/zeptomail/)
2. Sign up for free account (up to 10,000 emails/month)
3. Verify your email domain (or use their test domain)

### 5.2 Get SMTP Credentials

1. Go to **Mail Agents** > **SMTP**
2. Click **Add SMTP User**
3. Create a user and copy the password
4. Update `ZEPTO_SMTP_PASS` in your `.env` file

---

## Step 6: Configure Google OAuth (Optional)

If you want to enable Google login:

### 6.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Google+ API**

### 6.2 Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Authorized redirect URIs:
   - `http://localhost:3003/api/auth/google/callback`
   - Add production URL later
5. Copy **Client ID** and **Client Secret**
6. Update `.env` file

---

## Step 7: Install Dependencies

```bash
# Install all dependencies (root + all workspaces)
npm install
```

This will install dependencies for:
- Root workspace
- Gateway service
- Auth service
- Shared packages

---

## Step 8: Set Up Database

### 8.1 Generate Prisma Client

```bash
npm run prisma:generate
```

This generates the Prisma client based on your schema.

### 8.2 Run Database Migrations

```bash
npm run prisma:migrate
```

This will:
- Create all tables in your Supabase database
- Apply indexes and constraints
- Set up the schema

### 8.3 Seed Database (Optional)

```bash
npm run prisma:seed
```

This creates test users:
- **Customer**: `customer@test.com` / `Test@1234`
- **Rider**: `rider@test.com` / `Test@1234`
- **Admin**: `admin@test.com` / `Test@1234`

---

## Step 9: Start Development Servers

### Option A: Using npm scripts (Recommended)

```bash
npm run dev
```

This starts all services in development mode with hot reload.

### Option B: Start services individually

```bash
# Terminal 1 - Gateway
cd gateway
npm run dev

# Terminal 2 - Auth Service
cd services/auth-service
npm run dev
```

### Option C: Using Docker Compose

```bash
# Start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

---

## Step 10: Verify Installation

### 10.1 Check Services

Open your browser and visit:

- **Gateway**: http://localhost:3000
- **Auth Service**: http://localhost:3003
- **Health Check**: http://localhost:3000/health

You should see JSON responses indicating services are running.

### 10.2 Test Authentication

Use a tool like Postman or curl to test:

```bash
# Register a new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

You should receive a success response and an OTP email.

---

## Troubleshooting

### Database Connection Issues

**Error**: `Can't reach database server`

**Solution**:
- Check your `DATABASE_URL` is correct
- Verify Supabase project is running
- Check your internet connection
- Ensure database password is correct

### Email Not Sending

**Error**: `Failed to send email`

**Solution**:
- Verify ZeptoMail credentials
- Check `ZEPTO_SMTP_PASS` is correct
- Ensure your domain is verified in ZeptoMail
- Check email service logs

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Find process using port
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or change port in .env
```

### Prisma Client Not Generated

**Error**: `Cannot find module '@prisma/client'`

**Solution**:
```bash
cd services/auth-service
npm run prisma:generate
```

### Docker Issues

**Error**: `Cannot connect to Docker daemon`

**Solution**:
- Ensure Docker Desktop is running
- Check Docker service status
- Restart Docker

---

## Development Tools

### Prisma Studio

Visual database browser:

```bash
npm run prisma:studio
```

Opens at http://localhost:5555

### View Logs

```bash
# Gateway logs
tail -f gateway/logs/combined.log

# Auth service logs
tail -f services/auth-service/logs/combined.log

# Docker logs
npm run docker:logs
```

### Generate New JWT Secret

```bash
npm run generate-jwt
```

---

## Next Steps

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design
2. Review [API.md](./API.md) for API documentation
3. Check [DATABASE.md](./DATABASE.md) for database schema
4. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

## Getting Help

If you encounter issues:

1. Check this setup guide thoroughly
2. Review error messages carefully
3. Check service logs
4. Search existing issues
5. Create a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details
   - Relevant logs
