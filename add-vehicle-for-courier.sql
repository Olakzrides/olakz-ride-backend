-- Add a vehicle for courier f654e111-0b49-42a7-b130-2cb380864928 (Holy Spirit)

-- First, check what vehicle types are available
SELECT id, name, display_name FROM vehicle_types WHERE is_active = true;

-- Add a vehicle for the courier
-- Replace the vehicle_type_id with an appropriate one from the query above
INSERT INTO driver_vehicles (
    id,
    driver_id,
    vehicle_type_id,
    plate_number,
    manufacturer,
    model,
    year,
    color,
    is_active,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'f654e111-0b49-42a7-b130-2cb380864928',
    '3b96671b-d62a-432e-a251-884fa1df90ea', -- Replace with actual vehicle_type_id if different
    'ABC123',
    'Honda',
    'CRV',
    2023,
    'Silver',
    true,
    NOW(),
    NOW()
);

-- Verify the vehicle was added
SELECT 
    dv.id,
    dv.driver_id,
    dv.plate_number,
    dv.manufacturer,
    dv.model,
    dv.color,
    dv.is_active,
    dr.user_id,
    u.first_name || ' ' || u.last_name as driver_name
FROM driver_vehicles dv
JOIN drivers dr ON dr.id = dv.driver_id
JOIN users u ON u.id = dr.user_id
WHERE dv.driver_id = 'f654e111-0b49-42a7-b130-2cb380864928';
