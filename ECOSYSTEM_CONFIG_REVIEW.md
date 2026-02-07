# Auth Service Ecosystem Config Review

**Date:** February 6, 2026  
**File:** `services/auth-service/ecosystem.config.js`

---

## Analysis Summary

### 🔴 **Critical Issues Found**

1. **Missing Email Configuration** - ZeptoMail credentials not in ecosystem
2. **Missing JWT Token Expiry** - Token expiration times not configured
3. **Missing OTP Configuration** - OTP settings not in ecosystem
4. **Missing Super Admin Credentials** - Admin initialization will fail
5. **Incorrect Email Service Flag** - Set to 'false' but should be enabled
6. **Missing Frontend URLs** - Frontend and mobile app URLs not configured
7. **Missing Bcrypt Rounds** - Password hashing strength not set
8. **Missing Rate Limit Settings** - Registration and login limits not configured

---

## Detailed Comparison

### ✅ **Variables Present in Ecosystem (Correct)**

| Variable | Status | Notes |
|----------|--------|-------|
| `NODE_ENV` | ✅ Correct | Set to 'production' |
| `PORT` | ✅ Correct | 3003 |
| `DATABASE_URL` | ✅ Correct | PostgreSQL connection |
| `SUPABASE_URL` | ✅ Correct | Supabase endpoint |
| `SUPABASE_ANON_KEY` | ✅ Correct | Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Correct | Service role key |
| `JWT_SECRET` | ✅ Correct | JWT signing key |
| `ALLOWED_ORIGINS` | ✅ Correct | CORS origins |
| `LOG_LEVEL` | ✅ Correct | Set to 'info' |
| `GOOGLE_CLIENT_ID` | ✅ Correct | OAuth config |
| `GOOGLE_CLIENT_SECRET` | ✅ Correct | OAuth config |
| `GOOGLE_REDIRECT_URI` | ✅ Correct | OAuth callback |
| `APPLE_TEAM_ID` | ✅ Correct | Apple Sign-In |
| `APPLE_KEY_ID` | ✅ Correct | Apple Sign-In |
| `APPLE_SERVICE_ID` | ✅ Correct | Apple Sign-In |
| `APPLE_BUNDLE_ID` | ✅ Correct | Apple Sign-In |
| `APPLE_REDIRECT_URI` | ✅ Correct | Apple callback |
| `APPLE_PRIVATE_KEY` | ✅ Correct | Apple private key |
| `INTERNAL_API_KEY` | ✅ Correct | Service-to-service auth |

### ❌ **Variables Missing from Ecosystem (CRITICAL)**

| Variable | Impact | Required? |
|----------|--------|-----------|
| `JWT_ACCESS_TOKEN_EXPIRY` | 🔴 High | **YES** - Tokens won't expire properly |
| `JWT_REFRESH_TOKEN_EXPIRY` | 🔴 High | **YES** - Refresh tokens won't expire |
| `OTP_LENGTH` | 🔴 High | **YES** - OTP generation will fail |
| `OTP_EXPIRY_MINUTES` | 🔴 High | **YES** - OTP won't expire |
| `OTP_MAX_ATTEMPTS` | 🔴 High | **YES** - No attempt limiting |
| `OTP_RESEND_LIMIT_PER_HOUR` | 🔴 High | **YES** - No resend limiting |
| `ZEPTO_API_URL` | 🔴 **CRITICAL** | **YES** - Emails won't send! |
| `ZEPTO_API_KEY` | 🔴 **CRITICAL** | **YES** - Email auth will fail! |
| `ZEPTO_FROM_EMAIL` | 🔴 **CRITICAL** | **YES** - No sender email! |
| `ZEPTO_FROM_NAME` | 🔴 **CRITICAL** | **YES** - No sender name! |
| `SUPER_ADMIN_EMAIL` | 🔴 **CRITICAL** | **YES** - Admin won't initialize! |
| `SUPER_ADMIN_PASSWORD` | 🔴 **CRITICAL** | **YES** - Can't create admin! |
| `REGISTRATION_RATE_LIMIT` | 🟡 Medium | **YES** - No rate limiting |
| `LOGIN_RATE_LIMIT` | 🟡 Medium | **YES** - No rate limiting |
| `LOGIN_BLOCK_DURATION_MINUTES` | 🟡 Medium | **YES** - No blocking |
| `FRONTEND_URL` | 🟡 Medium | **YES** - Email links won't work |
| `MOBILE_APP_DEEP_LINK` | 🟡 Medium | **YES** - Deep links won't work |
| `BCRYPT_ROUNDS` | 🟡 Medium | **YES** - Default may be used |

### ⚠️ **Variables with Wrong Values**

| Variable | Current Value | Should Be | Impact |
|----------|---------------|-----------|--------|
| `EMAIL_SERVICE_ENABLED` | `'false'` | **Remove this** | Emails are working, this flag is misleading |
| `RATE_LIMIT_WINDOW_MS` | `'900000'` | **Remove this** | Not used in code |
| `RATE_LIMIT_MAX_REQUESTS` | `'100'` | **Remove this** | Not used in code |

---

## Security Analysis

### 🔴 **CRITICAL SECURITY ISSUES**

1. **Hardcoded Secrets in Ecosystem File**
   - ❌ Database password visible in plain text
   - ❌ JWT secret exposed
   - ❌ API keys visible
   - ❌ OAuth secrets exposed
   - ❌ Super admin password will be exposed

   **Risk:** If ecosystem file is committed to git or accessed by unauthorized users, all secrets are compromised.

2. **Missing Email Credentials**
   - Without ZeptoMail config, the notification system won't work
   - Driver approval/rejection emails won't send
   - Admin notifications won't send
   - OTP emails won't send

3. **Missing Super Admin Credentials**
   - Admin user won't be created on startup
   - No way to access admin panel
   - System initialization will fail

---

## Recommendations

### 🎯 **Best Practice: Use Environment Variables**

**Instead of hardcoding in ecosystem.config.js, use:**

```javascript
module.exports = {
  apps: [
    {
      name: 'auth-service',
      script: './dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend/services/auth-service',
      env_file: '.env',  // ← Load from .env file
      instances: 1,
      exec_mode: 'fork',
      // ... other PM2 settings
    }
  ]
};
```

**Benefits:**
- ✅ Secrets not in code
- ✅ Easy to rotate secrets
- ✅ Different configs per environment
- ✅ No git commits of secrets
- ✅ Follows 12-factor app principles

### 🔒 **Alternative: Use PM2 Ecosystem with env_file**

If you must use ecosystem.config.js, at least:

1. **Don't commit it to git** - Add to `.gitignore`
2. **Use environment variables** - Reference `process.env.*`
3. **Encrypt sensitive values** - Use PM2 keymetrics or vault
4. **Separate configs** - Different files for dev/staging/prod

---

## What Should Be in Ecosystem Config?

### ✅ **PM2 Configuration (Process Management)**

```javascript
{
  name: 'auth-service',
  script: './dist/server.js',
  cwd: '/home/deploy/olakz-ride-backend/services/auth-service',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  max_memory_restart: '1G',
  error_file: './logs/error.log',
  out_file: './logs/combined.log',
  log_file: './logs/combined.log',
  time: true,
  merge_logs: true,
  restart_delay: 4000,
  max_restarts: 10,
  min_uptime: '10s',
  env_file: '.env'  // ← Use this instead of hardcoding
}
```

### ❌ **What Should NOT Be in Ecosystem Config**

- Database passwords
- API keys
- JWT secrets
- OAuth secrets
- Admin credentials
- Email credentials
- Any sensitive information

---

## Email Configuration Analysis

### 📧 **Email Variables Missing from Ecosystem**

The notification system **requires** these variables:

```bash
ZEPTO_API_URL=https://api.zeptomail.com/v1.1/email
ZEPTO_API_KEY=wSsVR60j/hL3CKp+n2apJrttygwDB1n0FEx8ilLzvnKoF63L8sdvnkDOBA6kHfkcFzFrEmAR8u14zEgEgzsIjd4ozw0DWyiF9mqRe1U4J3x17qnvhDzDWW5dkxaPL4sBzwhun2hgE80g+g==
ZEPTO_FROM_EMAIL=noreply@olakzrides.com
ZEPTO_FROM_NAME=Olakz ride
```

**Without these:**
- ❌ Driver approval emails won't send
- ❌ Driver rejection emails won't send
- ❌ Admin notifications won't send
- ❌ OTP emails won't send
- ❌ Password reset emails won't send
- ❌ Welcome emails won't send

**Impact:** Your entire notification system will be broken in production!

---

## Super Admin Configuration Analysis

### 👤 **Admin Variables Missing from Ecosystem**

```bash
SUPER_ADMIN_EMAIL=superadmin@olakzrides.com
SUPER_ADMIN_PASSWORD=SuperAdmin@1234
```

**Without these:**
- ❌ Super admin won't be created on startup
- ❌ No way to access admin panel
- ❌ Can't approve/reject drivers
- ❌ Can't manage documents
- ❌ System initialization may fail

**Impact:** You won't be able to use admin features in production!

---

## Deployment Impact

### 🚨 **If You Deploy with Current Ecosystem Config**

**What Will Work:**
- ✅ User registration (but no email verification)
- ✅ User login
- ✅ OAuth (Google/Apple)
- ✅ Database connections
- ✅ API endpoints

**What Will NOT Work:**
- ❌ Email notifications (all types)
- ❌ OTP verification
- ❌ Password reset
- ❌ Driver approval emails
- ❌ Admin notifications
- ❌ Super admin creation
- ❌ Proper token expiration
- ❌ Rate limiting

---

## Recommended Actions

### 🎯 **Option 1: Use .env File (RECOMMENDED)**

1. Keep all secrets in `.env` file
2. Update ecosystem.config.js to use `env_file: '.env'`
3. Don't commit ecosystem.config.js with secrets
4. Use `.env.template` for documentation

**Pros:**
- ✅ Most secure
- ✅ Easy to manage
- ✅ Industry standard
- ✅ No secrets in code

### 🎯 **Option 2: Complete Ecosystem Config**

1. Add ALL missing variables to ecosystem.config.js
2. Add to `.gitignore` immediately
3. Never commit to git
4. Use separate files for each environment

**Pros:**
- ✅ All config in one place
- ✅ PM2-specific features available

**Cons:**
- ❌ Secrets in file
- ❌ Hard to rotate
- ❌ Risk of accidental commit

---

## Conclusion

### 📊 **Current Status**

| Category | Status | Score |
|----------|--------|-------|
| PM2 Configuration | ✅ Good | 9/10 |
| Environment Variables | ❌ Incomplete | 4/10 |
| Security | 🔴 Critical Issues | 3/10 |
| Email Config | ❌ Missing | 0/10 |
| Admin Config | ❌ Missing | 0/10 |
| **Overall** | 🔴 **Not Production Ready** | **4/10** |

### ⚠️ **Verdict**

**The current ecosystem.config.js is NOT production-ready.**

**Critical issues:**
1. Missing email configuration (notifications won't work)
2. Missing super admin credentials (admin panel won't work)
3. Missing OTP configuration (verification won't work)
4. Missing JWT expiry (security issue)
5. Hardcoded secrets (security risk)

**Recommendation:** 
- Use `.env` file approach (Option 1)
- Add all missing variables
- Remove hardcoded secrets
- Test thoroughly before production deployment

---

**Next Steps:**
1. Review this analysis
2. Decide on approach (env_file vs complete ecosystem)
3. I'll help implement the chosen approach
4. Test all functionality
5. Deploy with confidence
