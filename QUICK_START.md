# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account
- ZeptoMail account (for emails)

## Setup Steps

### 1. Clone & Setup (1 minute)

```bash
git clone <repository-url>
cd olakz-ride-backend
npm run setup
```

### 2. Configure Environment (2 minutes)

Edit `services/auth-service/.env`:

```bash
# Required: Get from Supabase Dashboard
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_ANON_KEY=your-key-here

# Required: Use generated secret from setup
JWT_SECRET=your-generated-secret-here

# Required: Get from ZeptoMail
ZEPTO_SMTP_PASS=your-zepto-password

# Optional: For Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
```

Edit `gateway/.env` (defaults are usually fine):

```bash
NODE_ENV=development
PORT=3000
AUTH_SERVICE_URL=http://localhost:3003
```

### 3. Install & Setup Database (2 minutes)

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed  # Optional: creates test users
```

### 4. Start Services

**Option A: npm (Recommended)**
```bash
npm run dev
```

**Option B: Docker**
```bash
npm run docker:up
```

### 5. Verify

Open in browser:
- Gateway: http://localhost:3000
- Auth Service: http://localhost:3003
- Health Check: http://localhost:3000/health

## Test Users (after seeding)

```
Customer: customer@test.com / Test@1234
Rider:    rider@test.com / Test@1234
Admin:    admin@test.com / Test@1234
```

## Common Commands

```bash
# Development
npm run dev                    # Start all services
npm run docker:up              # Start with Docker
npm run docker:logs            # View logs

# Database
npm run prisma:studio          # Visual database browser
npm run prisma:migrate         # Run migrations
npm run prisma:seed            # Seed test data

# Utilities
npm run generate-jwt           # Generate new JWT secret
npm run setup                  # Re-run setup
```

## Troubleshooting

**Can't connect to database?**
- Check DATABASE_URL in .env
- Verify Supabase project is running
- Check password is correct

**Port already in use?**
- Change PORT in .env files
- Or kill process using the port

**Prisma errors?**
- Run: `npm run prisma:generate`
- Check DATABASE_URL format

## Next Steps

1. Read [README.md](./README.md) for full documentation
2. Check [docs/SETUP.md](./docs/SETUP.md) for detailed setup
3. Review [WEEK1_COMPLETION.md](./WEEK1_COMPLETION.md) for what's done

## Need Help?

- Check logs: `npm run docker:logs`
- Review [docs/SETUP.md](./docs/SETUP.md) troubleshooting section
- Check service health: http://localhost:3000/health
