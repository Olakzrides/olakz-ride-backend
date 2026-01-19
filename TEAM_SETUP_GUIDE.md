# 🚀 Team Member Setup Guide

**Complete setup instructions for new team members joining the Olakz Ride Backend project.**

## 📋 Prerequisites

Before starting, ensure you have:
- **Node.js 18+** installed
- **npm** (comes with Node.js)
- **Git** installed
- **Supabase account** access (ask team lead for project invitation)
- **Postman** (for API testing)

---

## 🎯 Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Olakzrides/olakz-ride-backend.git
cd olakz-ride-backend
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install
```

### 3. Environment Variables Setup

**You need to create `.env` files for each service:**

```bash
# Copy environment templates
cp services/auth-service/.env.template services/auth-service/.env
cp services/core-logistics/.env.template services/core-logistics/.env
cp gateway/.env.template gateway/.env
```

**⚠️ IMPORTANT: Ask your team lead for the actual environment values:**
- Supabase URL and keys
- JWT secrets
- Database URLs
- Any other sensitive credentials

**Update each `.env` file with the real values provided by your team lead.**

### 4. Database Setup

**Run migrations for both services:**

```bash
# Auth Service migrations
cd services/auth-service
npx prisma migrate deploy
npx prisma generate

# Core Logistics migrations
cd ../core-logistics
npx prisma migrate deploy
npx prisma generate

# Go back to root
cd ../..
```

### 5. Seed Database (Optional - Ask Team Lead)

```bash
cd services/core-logistics
npm run seed
cd ../..
```

**⚠️ Note: Only run seed if your team lead says it's needed. Don't seed if the database already has data.**

### 6. Build All Services

```bash
# Build auth service
cd services/auth-service
npm run build

# Build logistics service
cd ../core-logistics
npm run build

# Build gateway
cd ../../gateway
npm run build

# Go back to root
cd ..
```

### 7. Test the Setup

**Start all services (use 3 separate terminals):**

**Terminal 1 - Auth Service:**
```bash
cd services/auth-service
npm run dev
```
*Wait for: "🚀 Auth Service running on port 3003"*

**Terminal 2 - Logistics Service:**
```bash
cd services/core-logistics
npm run dev
```
*Wait for: "🚀 Core Logistics Service running on port 3001" and "Socket.IO enabled"*

**Terminal 3 - Gateway:**
```bash
cd gateway
npm run dev
```
*Wait for: "🚀 API Gateway running on port 3000"*

### 8. Import Postman Collection

1. Open Postman
2. Click **Import**
3. Select `Olakz_Ride_Logistics.postman_collection.json` from the project root
4. Test the `/health` endpoints to verify everything works

---

## ✅ Verification Checklist

After setup, verify these work:

- [ ] All 3 services start without errors
- [ ] Auth service responds at `http://localhost:3003/health`
- [ ] Logistics service responds at `http://localhost:3001/health`
- [ ] Gateway responds at `http://localhost:3000/health`
- [ ] Postman collection imports successfully
- [ ] You can register a new user via Postman
- [ ] You can login via Postman

---

## 🔧 Development Workflow

### Daily Development

1. **Pull latest changes:**
   ```bash
   git pull origin main
   ```

2. **Install any new dependencies:**
   ```bash
   npm install
   ```

3. **Check for new migrations:**
   ```bash
   cd services/auth-service && npx prisma migrate deploy
   cd ../core-logistics && npx prisma migrate deploy
   ```

4. **Regenerate Prisma clients if schema changed:**
   ```bash
   cd services/auth-service && npx prisma generate
   cd ../core-logistics && npx prisma generate
   ```

5. **Start development:**
   ```bash
   # Start all services in separate terminals
   npm run dev:auth      # Terminal 1
   npm run dev:logistics # Terminal 2
   npm run dev:gateway   # Terminal 3
   ```

### Creating New Features

1. **Create feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

3. **Test thoroughly**

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request on GitHub**

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module '@prisma/client'"
**Solution:**
```bash
cd services/auth-service && npx prisma generate
cd ../core-logistics && npx prisma generate
```

### Issue: "Database connection failed"
**Solution:**
- Check your `.env` files have correct Supabase credentials
- Verify you have access to the Supabase project
- Ask team lead to add you to Supabase project

### Issue: "Port already in use"
**Solution:**
```bash
# Kill all node processes
taskkill /F /IM node.exe
# Then restart services
```

### Issue: Migration errors
**Solution:**
```bash
# Reset and reapply migrations
cd services/[service-name]
npx prisma migrate reset
npx prisma migrate deploy
```

### Issue: Build errors after pulling changes
**Solution:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📚 Important Files to Know

- **`README.md`** - Project overview and quick start
- **`package.json`** - Root dependencies and scripts
- **`services/auth-service/`** - Authentication microservice
- **`services/core-logistics/`** - Main logistics microservice
- **`gateway/`** - API Gateway
- **`docs/`** - Detailed documentation
- **`Olakz_Ride_Logistics.postman_collection.json`** - API testing collection

---

## 🤝 Getting Help

1. **Check documentation** in `/docs` folder
2. **Review Postman collection** for API examples
3. **Ask in team chat** for quick questions
4. **Create GitHub issue** for bugs or feature requests
5. **Schedule pair programming** for complex features

---

## 🎉 You're Ready!

Once you complete this setup, you'll have:
- ✅ Full development environment running
- ✅ Access to all microservices
- ✅ Database with proper schema
- ✅ API testing tools ready
- ✅ Real-time features working

**Welcome to the team! 🚀**

---

## 📞 Emergency Contacts

- **Team Lead**: [Your contact info]
- **DevOps**: [DevOps contact]
- **Supabase Admin**: [Admin contact]

**Happy coding! 💻**