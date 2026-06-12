# Requirements Document

## Introduction

This feature extends the Olakz ride-hailing admin service to support city-tiered pricing configuration. Admins can assign Nigerian states to one of three economic tiers (High, Middle, Low) and set distinct vehicle pricing per tier. The fare calculation engine in the core-logistics service is updated to resolve the correct pricing tier from a rider's pickup state at booking time, falling back to the existing National pricing when a state has no tier assignment.

The database schema, Prisma model, Nigerian states constant, and national fallback seed data are already in place. This feature builds the admin API surface and the fare-resolution logic on top of that foundation.

---

## Glossary

- **Admin**: An authenticated administrator user of the Olakz backend with access to the admin service.
- **City_Tier**: One of four pricing tiers: `high`, `middle`, `low`, or `national`. Determines which fare config applies to a ride.
- **State**: One of the 37 Nigerian administrative divisions (36 states + FCT) as defined in `nigerian-states.ts`.
- **Tier_Assignment**: The mapping of a State to a City_Tier stored in the `states` JSONB column of `ride_fare_config`.
- **National_Tier**: The fallback City_Tier (`national`) that applies when a State has no explicit Tier_Assignment. Its `states` array is always empty.
- **Vehicle_Category**: One of `car`, `bicycle`, `motorcycle`, `bus`, or `truck`.
- **Service_Tier**: The sub-category within a Vehicle_Category. For `car`: `standard`, `premium`, or `vip`. For all other Vehicle_Categories: `default`.
- **Fare_Config**: A single row in `ride_fare_config` uniquely identified by `(vehicle_category, service_tier, city_tier)`.
- **Pricing_Admin_Service**: The existing `PricingAdminService` class in `services/admin-service/src/services/pricing-admin.service.ts`.
- **Fare_Service**: The existing `FareService` class in `services/core-logistics/src/services/fare.service.ts`.
- **Pickup_State**: The Nigerian State resolved from a rider's pickup GPS coordinates at booking time.

---

## Requirements

### Requirement 1: Retrieve All Nigerian States with Tier Assignments

**User Story:** As an admin, I want to see all 37 Nigerian states alongside their current city tier assignment, so that I can understand the current pricing geography at a glance.

#### Acceptance Criteria

1. THE Pricing_Admin_Service SHALL expose a method that returns all 37 Nigerian states, each annotated with its current City_Tier assignment or `null` if unassigned.
2. WHEN the admin calls `GET /api/admin/pricing/states`, THE Admin_API SHALL return a list of all 37 states with fields: `name`, `code`, `geoPoliticalZone`, and `currentTier` (one of `high`, `middle`, `low`, or `null`).
3. WHEN no states have been assigned to any City_Tier, THE Admin_API SHALL return all 37 states with `currentTier: null`.
4. THE Admin_API SHALL return the states list sorted alphabetically by state name.

---

### Requirement 2: Retrieve Fare Configs Grouped by City Tier

**User Story:** As an admin, I want to view all fare configurations organised by city tier, so that I can compare pricing across tiers in one view.

#### Acceptance Criteria

1. WHEN the admin calls `GET /api/admin/pricing/city-tiers`, THE Admin_API SHALL return all Fare_Configs grouped under their respective City_Tier keys (`high`, `middle`, `low`, `national`).
2. THE Admin_API SHALL include the `states` array in each Fare_Config response so the admin can see which states belong to each tier.
3. WHEN no Fare_Config exists for a given City_Tier, THE Admin_API SHALL return an empty array for that tier key rather than omitting the key.

---

### Requirement 3: Retrieve Fare Configs for a Specific City Tier

**User Story:** As an admin, I want to view all vehicle pricing for a single city tier, so that I can review or edit that tier's configuration in isolation.

#### Acceptance Criteria

1. WHEN the admin calls `GET /api/admin/pricing/city-tiers/:tier` with a valid tier value, THE Admin_API SHALL return all Fare_Configs for that City_Tier ordered by `vehicle_category` then `service_tier`.
2. IF the `:tier` path parameter is not one of `high`, `middle`, `low`, or `national`, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_CITY_TIER`.
3. WHEN no Fare_Config exists for the requested City_Tier, THE Admin_API SHALL return HTTP 200 with an empty `configs` array.

---

### Requirement 4: Assign States to a City Tier

**User Story:** As an admin, I want to assign a set of Nigerian states to a city tier, so that rides originating in those states use the correct pricing.

#### Acceptance Criteria

1. WHEN the admin calls `POST /api/admin/pricing/city-tiers/:tier/assign-states` with a valid `states` array, THE Pricing_Admin_Service SHALL update the `states` column of every Fare_Config row belonging to that City_Tier to the provided array.
2. WHEN a State in the request is currently assigned to a different City_Tier, THE Pricing_Admin_Service SHALL remove that State from the other tier's Fare_Config rows before adding it to the target tier, ensuring no State belongs to more than one City_Tier at a time.
3. IF the `:tier` path parameter is `national`, THEN THE Admin_API SHALL return HTTP 400 with error code `NATIONAL_TIER_NOT_ASSIGNABLE` because the National_Tier is a fallback and does not accept explicit state assignments.
4. IF any value in the `states` array is not a valid Nigerian state name as defined in `nigerian-states.ts`, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_STATE_NAME` and list the unrecognised values.
5. IF the `states` array is missing or is not an array, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_REQUEST_BODY`.
6. WHEN the `states` array is empty, THE Pricing_Admin_Service SHALL clear all state assignments from the target City_Tier (effectively unassigning all states from that tier).
7. WHEN the assignment succeeds, THE Admin_API SHALL return HTTP 200 with the updated list of Fare_Configs for the target City_Tier.
8. THE Pricing_Admin_Service SHALL perform the state removal from other tiers and the assignment to the target tier as an atomic operation so that no State is left without a tier or duplicated across tiers during the update.

---

### Requirement 5: Update Pricing for a Specific City Tier Config

**User Story:** As an admin, I want to update the pricing fields for a specific vehicle category, service tier, and city tier combination, so that I can set different rates per economic zone.

#### Acceptance Criteria

1. WHEN the admin calls `PUT /api/admin/pricing/:vehicleCategory/:serviceTier/:cityTier` with a valid request body, THE Pricing_Admin_Service SHALL update only the provided pricing fields on the matching Fare_Config row.
2. IF the `:cityTier` path parameter is not one of `high`, `middle`, `low`, or `national`, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_CITY_TIER`.
3. IF the `:vehicleCategory` path parameter is not one of `car`, `bicycle`, `motorcycle`, `bus`, or `truck`, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_CATEGORY`.
4. IF the `:serviceTier` path parameter is not one of `standard`, `premium`, `vip`, or `default`, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_TIER`.
5. IF any numeric pricing field in the request body is less than 0, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_VALUE` identifying the offending field.
6. IF `shared_discount_percent` or `fleet_commission_percent` exceeds 100, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_VALUE` identifying the offending field.
7. IF no Fare_Config exists for the given `(vehicleCategory, serviceTier, cityTier)` combination, THEN THE Admin_API SHALL return HTTP 404 with error code `CONFIG_NOT_FOUND`.
8. WHEN the update succeeds, THE Admin_API SHALL return HTTP 200 with the full updated Fare_Config row.

---

### Requirement 6: Create a New City Tier Fare Config

**User Story:** As an admin, I want to create a fare config for a vehicle category under a specific city tier when one does not yet exist, so that I can activate tiered pricing for that vehicle type.

#### Acceptance Criteria

1. WHEN the admin calls `POST /api/admin/pricing/city-tiers/:tier/create` with a valid `vehicleCategory`, `serviceTier`, and all required pricing fields, THE Pricing_Admin_Service SHALL insert a new Fare_Config row with `city_tier` set to `:tier` and `states` set to `[]`.
2. IF a Fare_Config already exists for the given `(vehicleCategory, serviceTier, cityTier)` combination, THEN THE Admin_API SHALL return HTTP 409 with error code `CONFIG_ALREADY_EXISTS`.
3. IF any required pricing field is missing from the request body, THEN THE Admin_API SHALL return HTTP 400 with error code `MISSING_REQUIRED_FIELD` identifying the missing fields.
4. IF any numeric pricing field is less than 0, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_VALUE`.
5. IF `shared_discount_percent` or `fleet_commission_percent` exceeds 100, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_VALUE`.
6. IF the `:tier` path parameter is not one of `high`, `middle`, or `low`, THEN THE Admin_API SHALL return HTTP 400 with error code `INVALID_CITY_TIER` because `national` configs are managed via seeding and not created through this endpoint.
7. WHEN the creation succeeds, THE Admin_API SHALL return HTTP 201 with the newly created Fare_Config row.

---

### Requirement 7: Backward-Compatible Existing Pricing Endpoints

**User Story:** As an admin, I want the existing pricing endpoints to continue working without modification, so that any integrations built against the current API are not broken.

#### Acceptance Criteria

1. THE Admin_API SHALL continue to serve `GET /api/admin/pricing` and return all Fare_Configs grouped by `vehicle_category` as before.
2. THE Admin_API SHALL continue to serve `GET /api/admin/pricing/:vehicleCategory` and return all Fare_Configs for that category including the new `city_tier` and `states` fields.
3. THE Admin_API SHALL continue to serve `GET /api/admin/pricing/:vehicleCategory/:serviceTier` and return the Fare_Config row. WHEN multiple rows exist for the same `(vehicleCategory, serviceTier)` across different city tiers, THE Admin_API SHALL return the `national` tier row to preserve the original single-row contract.
4. THE Admin_API SHALL continue to serve `PUT /api/admin/pricing/:vehicleCategory/:serviceTier` and apply updates to the `national` tier row for that `(vehicleCategory, serviceTier)` combination.

---

### Requirement 8: City-Tier-Aware Fare Resolution in Core Logistics

**User Story:** As a rider, I want my fare to reflect the pricing tier of my pickup location, so that I am charged the correct rate for my city.

#### Acceptance Criteria

1. WHEN `getFareConfig` is called with a `pickupState` parameter, THE Fare_Service SHALL query `ride_fare_config` for a row whose `states` JSONB array contains that state name and whose `vehicle_category` and `service_tier` match the requested values.
2. WHEN a matching Fare_Config is found for the resolved City_Tier, THE Fare_Service SHALL use that config for fare calculation.
3. WHEN no Fare_Config row has the `pickupState` in its `states` array, THE Fare_Service SHALL fall back to the `national` tier Fare_Config for the same `(vehicleCategory, serviceTier)`.
4. WHEN `getFareConfig` is called without a `pickupState` parameter, THE Fare_Service SHALL behave as it does today (query without city tier filter) to preserve backward compatibility with callers that do not yet supply pickup state.
5. WHEN `calculateVariantPrices` is called with a `pickupLocation`, THE Fare_Service SHALL resolve the Pickup_State from the pickup coordinates and pass it to `getFareConfig`.
6. WHEN `calculateFinalFare` is called, THE Fare_Service SHALL resolve the Pickup_State from `pickupLocation` coordinates and pass it to `getFareConfig`.
7. WHEN `calculateCompletionFare` is called, THE Fare_Service SHALL accept an optional `pickupState` parameter and pass it to `getFareConfig` when provided.
8. IF the state resolution from coordinates fails or returns an unrecognised state name, THEN THE Fare_Service SHALL fall back to the `national` tier config and log a warning with the unresolved coordinates.

---

### Requirement 9: State Uniqueness Invariant

**User Story:** As an admin, I want the system to guarantee that each Nigerian state belongs to at most one city tier at any time, so that fare resolution is always deterministic.

#### Acceptance Criteria

1. THE Pricing_Admin_Service SHALL enforce that after any state assignment operation, each State name appears in the `states` array of at most one Fare_Config row across all City_Tiers.
2. THE Pricing_Admin_Service SHALL enforce that the `national` tier Fare_Config rows always have an empty `states` array.
3. WHEN the Fare_Service queries for a state's City_Tier, THE Fare_Service SHALL expect at most one matching Fare_Config row per `(vehicleCategory, serviceTier)` combination and treat multiple matches as a data integrity error, logging an error and falling back to `national`.

---

### Requirement 10: Input Validation for Pricing Fields

**User Story:** As an admin, I want the API to reject invalid pricing values immediately, so that corrupt data never reaches the database.

#### Acceptance Criteria

1. THE Admin_API SHALL validate that `estimated_billing_unit`, `high_traffic_estimated_billing_unit`, `min_amount_less_than_3km`, `min_amount_for_shared_ride`, `service_fee`, `rounding_fee`, and `booking_fee` are each greater than or equal to 0 when present in a create or update request.
2. THE Admin_API SHALL validate that `shared_discount_percent` and `fleet_commission_percent` are each between 0 and 100 inclusive when present in a create or update request.
3. IF `is_active` is provided, THE Admin_API SHALL accept only boolean values and return HTTP 400 with error code `INVALID_VALUE` for any other type.
4. THE Admin_API SHALL ignore any request body fields that are not recognised pricing fields, rather than returning an error, to allow forward-compatible clients.
