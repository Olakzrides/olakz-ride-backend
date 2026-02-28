-- Debug script to check vehicle data for courier
-- Replace 'f654e111-0b49-42a7-b130-2cb380864928' with your actual courier_id

-- 1. Check if driver exists
SELECT 
    id,
    user_id,
    status,
    service_types,
    delivery_rating
FROM drivers 
WHERE id = 'f654e111-0b49-42a7-b130-2cb380864928';

-- 2. Check all vehicles for this driver (including inactive)
SELECT 
    id,
    driver_id,
    vehicle_type_id,
    plate_number,
    manufacturer,
    model,
    year,
    color,
    is_active,
    created_at
FROM driver_vehicles 
WHERE driver_id = 'f654e111-0b49-42a7-b130-2cb380864928'
ORDER BY created_at DESC;

-- 3. Check only active vehicles (what the API queries)
SELECT 
    plate_number,
    manufacturer,
    model,
    color
FROM driver_vehicles 
WHERE driver_id = 'f654e111-0b49-42a7-b130-2cb380864928'
  AND is_active = true;

-- 4. Check if there are any vehicles at all in the table
SELECT COUNT(*) as total_vehicles FROM driver_vehicles;

-- 5. Check if there are any active vehicles in the table
SELECT COUNT(*) as active_vehicles FROM driver_vehicles WHERE is_active = true;

-- 6. Get all vehicles with driver info
SELECT 
    dv.id,
    dv.driver_id,
    d.user_id,
    dv.plate_number,
    dv.manufacturer,
    dv.model,
    dv.color,
    dv.is_active
FROM driver_vehicles dv
JOIN drivers d ON d.id = dv.driver_id
WHERE dv.driver_id = 'f654e111-0b49-42a7-b130-2cb380864928';
