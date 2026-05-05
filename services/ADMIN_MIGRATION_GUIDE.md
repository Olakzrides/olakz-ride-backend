Step 1 — Scaffold the admin-service (port 3008) Create the folder structure, package.json, tsconfig.json, nodemon.json, .env, app.ts, server.ts, config, middleware, utils. Nothing functional yet — just the skeleton that compiles and starts.

Step 2 — Move core-logistics admin features

Driver management (admin-driver.controller + admin-driver.service)
Document management (admin-document.controller + admin-document.service + ocr.service + document-access-log.service)
Delivery admin (admin-delivery.controller + delivery-analytics.service)
Then delete from core-logistics and verify it still starts
Step 3 — Move food-service admin features

food-admin.controller + food-admin.service
Admin analytics routes
Then delete from food-service and verify
Step 4 — Move marketplace-service admin features

admin.controller + admin.service
Then delete from marketplace-service and verify
Step 5 — Move platform-service admin features

adminGetAll, adminApprove, adminReject from vendor-registration
Then delete from platform-service and verify
Step 6 — Move auth-service admin features

User role management endpoint
Then delete from auth-service and verify
Step 7 — Register admin-service in gateway

Add /api/admin/* route pointing to port 3008
Step 8 — Verify everything works end to end

One step at a time, verify after each step before moving to the next.