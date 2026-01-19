# Phase 2: Driver Management - Migration Guide

## Database Migration

The Phase 2 migration adds 5 new tables for driver management:

1. **drivers** - Driver profiles
2. **driver_vehicles** - Driver vehicle information
3. **driver_documents** - Document uploads (license, insurance, etc.)
4. **driver_availability** - Online/offline status
5. **driver_locations** - Location tracking history

## How to Apply Migration

### Option 1: Run SQL Directly in Supabase (RECOMMENDED)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the entire contents of `services/core-logistics/prisma/migrations/20260115_add_driver_management/migration.sql`
4. Paste and run the SQL

### Option 2: Use Prisma Migrate (if database connection works)

```bash
cd services/core-logistics
npx prisma migrate deploy
```

## Verify Migration

After running the migration, verify the tables were created:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('drivers', 'driver_vehicles', 'driver_documents', 'driver_availability', 'driver_locations');

-- Check driver table structure
\d drivers
```

## Initialize Storage Bucket

The driver documents feature uses Supabase Storage. Initialize the bucket:

1. Go to Supabase Dashboard → Storage
2. Create a new bucket named `driver-documents`
3. Set it to **Private** (not public)
4. Set file size limit to **10MB**

Or run this in your application startup (already included in the service):

```typescript
await StorageUtil.initializeBucket();
```

## Seed Test Data (Optional)

You can add test drivers after migration:

```bash
cd services/core-logistics
npm run prisma:seed
```

## Rollback (if needed)

If you need to rollback the migration:

```sql
-- Drop tables in reverse order (respecting foreign keys)
DROP TABLE IF EXISTS driver_locations CASCADE;
DROP TABLE IF EXISTS driver_availability CASCADE;
DROP TABLE IF EXISTS driver_documents CASCADE;
DROP TABLE IF EXISTS driver_vehicles CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;

-- Remove foreign key from rides table
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_driver_id_fkey;
```

## Next Steps

After migration:

1. ✅ Start the logistics service
2. ✅ Test driver registration endpoint
3. ✅ Upload test documents
4. ✅ Test admin approval flow
5. ✅ Test driver status updates
6. ✅ Test location updates
7. ✅ Test nearby drivers search

See `PHASE2_TESTING_GUIDE.md` for complete testing instructions.
