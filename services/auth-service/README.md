# Auth Service

Authentication and authorization microservice for Olakz Ride.

## Features

✅ Email/Password Registration
✅ Email Verification with 4-digit OTP
✅ Login with JWT tokens
✅ Token Refresh
✅ Password Reset with OTP
✅ Google OAuth (Server-side & Client-side)
✅ Role-based Access Control
✅ Rate Limiting
✅ Secure Password Requirements

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.template .env
# Edit .env with your credentials
```

### 3. Setup Database

Run the SQL scripts in Supabase:
1. `docs/Supabase Complete Setup SQL`
2. `docs/Seed Data for Testing`

### 4. Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Paste the output in `.env` as `JWT_SECRET`

### 5. Start Development Server

```bash
npm run dev
```

## API Endpoints

### Authentication

**Register User**
```http
POST /api/auth/register
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "Test@1234"
}
```

**Verify Email**
```http
POST /api/auth/verify-email
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "1234"
}
```

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "Test@1234"
}
```

**Refresh Token**
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your_refresh_token"
}
```

**Forgot Password**
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Reset Password**
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "1234",
  "newPassword": "NewPass@1234"
}
```

### Google OAuth

**Server-Side Flow (Browser)**
```http
GET /api/auth/google
```

**Client-Side Flow (Mobile)**
```http
POST /api/auth/google/verify
Content-Type: application/json

{
  "googleToken": "google_id_token"
}
```

### User Management

**Get Current User**
```http
GET /api/users/me
Authorization: Bearer your_access_token
```

**Update Profile**
```http
PUT /api/users/profile
Authorization: Bearer your_access_token
Content-Type: application/json

{
  "firstName": "Jane",
  "phone": "+2348012345678"
}
```

**Update Role**
```http
PUT /api/users/role
Authorization: Bearer your_access_token
Content-Type: application/json

{
  "role": "rider",
  "vehicleType": "bicycle"
}
```

**Change Password**
```http
PATCH /api/users/password
Authorization: Bearer your_access_token
Content-Type: application/json

{
  "currentPassword": "Test@1234",
  "newPassword": "NewPass@1234"
}
```

## Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character: `#^()_-+=[]{}|:;,./<>~@$!%*?&`

## OTP Configuration

- **Length:** 4 digits
- **Expiry:** 10 minutes
- **Max Attempts:** 3
- **Resend Limit:** 3 per hour

## JWT Tokens

- **Access Token:** 15 minutes expiry
- **Refresh Token:** 7 days expiry

## Rate Limiting

- **Registration:** 5 per hour per IP
- **Login Failures:** 5 attempts, then 15-minute block
- **OTP Resend:** 3 per hour per email

## Test Accounts

```javascript
// Admin
{ email: "admin@olakzrides.com", password: "Test@1234" }

// Customer (Verified)
{ email: "customer@test.com", password: "Test@1234" }

// Customer (Unverified - OTP: 1234)
{ email: "unverified@test.com", password: "Test@1234" }

// Rider
{ email: "rider@test.com", password: "Test@1234" }
```

## Environment Variables

See `.env.template` for all required variables.

## Development

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Start production
npm start

# Type check
npm run typecheck

# Run tests
npm test
```

## Production Deployment

```bash
# Build
npm run build

# Start
NODE_ENV=production npm start
```

## Logs

Logs are written to:
- `logs/error.log` - Errors only
- `logs/combined.log` - All logs

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWTs signed with HS256
- Refresh tokens hashed before storage
- Rate limiting on sensitive endpoints
- Email verification required
- CORS configured

## Support

For issues, contact support@olakzrides.com