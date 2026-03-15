# VENDOR/RESTAURANT ONBOARDING & REGISTRATION GUIDE

**Document Purpose:** Implementation guide for vendor registration flow in Olakz Food platform  
**Status:** Planning Phase  
**Note:** This document will be deleted after implementation is complete

---

## VENDOR REGISTRATION FLOW ANALYSIS

Based on the UI design, the vendor registration process consists of the following screens:

### PHASE 1: ACCOUNT CREATION & VERIFICATION

#### Screen 1: Create Account
**Fields:**
- Email address
- Password
- Confirm password

**Actions:**
- Create account button
- Navigate to email verification

**Backend Requirements:**
- POST `/api/auth/vendor/register`
- Validate email format and password strength
- Check if email already exists
- Create vendor user with role 'vendor'
- Send email verification OTP
- Return user_id and session token

---

#### Screen 2: Email Verification
**Fields:**
- 4-digit OTP input boxes
- Resend code link

**Actions:**
- Submit OTP for verification
- Resend OTP if needed
- Navigate to success screen on verification

**Backend Requirements:**
- POST `/api/auth/vendor/verify-email`
- Validate OTP code
- Mark email as verified
- Update user status
- Return verification success

---

#### Screen 3: Email Verified Success
**Display:**
- Success checkmark icon
- "Email Verified" message
- Success confirmation text

**Actions:**
- Continue to business details

**Backend Requirements:**
- No API call (UI state only)

---

### PHASE 2: BUSINESS INFORMATION

#### Screen 4: Personal/Business Details
**Fields:**
- Business name (text input)
- Business Email (email input)
- Phone number (with country code)
- Business Type (dropdown selector)
  - Options: Restaurant, Market Place, Car Wash, Mechanics

**Checkboxes:**
- Terms & Conditions agreement
- Privacy Policy agreement

**Actions:**
- Continue button (validates all fields)

**Backend Requirements:**
- POST `/api/vendor/business-details`
- Validate business information
- Check if business name/email already exists
- Store business details
- Return business_id

---

### PHASE 3: BUSINESS VERIFICATION

#### Screen 5: Verify Your Business (Document Checklist)
**Display Checklist:**
- CAC document
- CAC certificate
- CAC Memorandum & Artg. Associat
- CAC Status report

**Actions:**
- Continue to document upload

**Backend Requirements:**
- No API call (informational screen)

---

#### Screen 6: Profile Picture Upload
**Fields:**
- Image upload area (single image)
- "Choose from gallery" option

**Actions:**
- Upload profile picture
- Continue button

**Backend Requirements:**
- POST `/api/vendor/profile-picture`
- Upload image to storage (Supabase)
- Store image URL in database
- Return uploaded image URL

---

#### Screen 7: Enter ID Information (NIN Verification)
**Fields:**
- NIN Number input
- "Forgot NIN Number?" link

**Actions:**
- Continue button (validates NIN)

**Backend Requirements:**
- POST `/api/vendor/verify-nin`
- Validate NIN format
- Optional: Integrate with NIN verification API
- Store NIN (encrypted)
- Return verification status

---

#### Screen 8: Upload ID Documents
**Fields:**
- Document upload area
- "Select upload option" button
  - Camera
  - Gallery
  - Files

**Actions:**
- Upload ID document
- Continue button

**Backend Requirements:**
- POST `/api/vendor/id-documents`
- Upload document to storage
- Store document URL and metadata
- Return upload confirmation

---

### PHASE 4: BANK ACCOUNT & STORE SETUP

#### Screen 9: Bank Account Verification
**Fields:**
- Bank name (dropdown)
- Account number (text input)
- Account name (auto-populated after verification)

**Actions:**
- Verify account button
- Continue button

**Backend Requirements:**
- POST `/api/vendor/bank-account`
- Integrate with bank verification API (Paystack/Flutterwave)
- Validate account number
- Retrieve account name
- Store bank details
- Return verification status

---

#### Screen 10: Store Images Upload
**Fields:**
- Multiple image upload slots (4+ images)
- Upload button for each slot

**Actions:**
- Upload multiple store images
- Continue button

**Backend Requirements:**
- POST `/api/vendor/store-images`
- Upload multiple images to storage
- Store image URLs array
- Return uploaded image URLs

---

#### Screen 11: Registration Successful
**Display:**
- Success checkmark icon
- "Registration Successful" message
- Success confirmation text

**Actions:**
- "Get Started" button (navigate to vendor dashboard)

**Backend Requirements:**
- PATCH `/api/vendor/complete-registration`
- Update vendor status to 'pending_approval' or 'active'
- Send notification to admin for approval
- Return vendor profile data

---

## IMPLEMENTATION PHASES

### PHASE 1: ACCOUNT CREATION & EMAIL VERIFICATION
**Goal:** Vendor can create account and verify email

**Database Tables:**
- Extend `users` table in auth-service with vendor role
- Create `vendor_profiles` table in platform-service

**APIs to Build:**
1. POST `/api/auth/vendor/register` - Create vendor account
2. POST `/api/auth/vendor/verify-email` - Verify email OTP
3. POST `/api/auth/vendor/resend-otp` - Resend verification code

**Features:**
- Email-only verification (NO phone verification)
- OTP generation and validation
- Email sending via existing email service
- Session management

---

### PHASE 2: BUSINESS INFORMATION & VERIFICATION
**Goal:** Vendor can submit business details and documents

**Database Tables:**
- `vendor_business_details` - Business information
- `vendor_documents` - Document uploads
- `business_types` - Restaurant, Market Place, etc.

**APIs to Build:**
1. POST `/api/vendor/business-details` - Submit business info
2. GET `/api/vendor/business-types` - Get business type options
3. POST `/api/vendor/profile-picture` - Upload profile image
4. POST `/api/vendor/verify-nin` - Verify NIN
5. POST `/api/vendor/id-documents` - Upload ID documents

**Features:**
- File upload handling (images, PDFs)
- Business name uniqueness validation
- Document storage in Supabase
- NIN format validation

---

### PHASE 3: BANK ACCOUNT & STORE SETUP
**Goal:** Vendor can add bank details and store images

**Database Tables:**
- `vendor_bank_accounts` - Bank account details (encrypted)
- `vendor_store_images` - Store photos

**APIs to Build:**
1. POST `/api/vendor/bank-account` - Add and verify bank account
2. GET `/api/vendor/banks` - Get list of supported banks
3. POST `/api/vendor/store-images` - Upload store images
4. PATCH `/api/vendor/complete-registration` - Finalize registration

**Features:**
- Bank account verification (Paystack/Flutterwave)
- Multiple image uploads
- Registration completion workflow
- Admin notification for approval

---

## TECHNICAL REQUIREMENTS

### Services Involved:
1. **auth-service** - Vendor account creation and authentication
2. **platform-service** - Vendor business details, documents, bank accounts
3. **gateway** - Route all vendor APIs through gateway

### External Integrations:
1. **Email Service** - Already exists (Resend/SendGrid)
2. **Storage** - Supabase Storage (already configured)
3. **Bank Verification** - Paystack or Flutterwave API
4. **NIN Verification** - Optional (can be manual admin verification)

### Security Considerations:
- Encrypt sensitive data (NIN, bank account)
- Validate file types and sizes for uploads
- Rate limiting on registration endpoints
- CSRF protection
- Input sanitization

---

## DATABASE SCHEMA OVERVIEW

### vendor_profiles
```sql
- id (uuid, PK)
- user_id (uuid, FK to users)
- business_name (varchar)
- business_email (varchar)
- phone_number (varchar)
- business_type (enum: restaurant, market_place, car_wash, mechanics)
- profile_picture_url (text)
- status (enum: pending, active, suspended, rejected)
- created_at (timestamp)
- updated_at (timestamp)
```

### vendor_documents
```sql
- id (uuid, PK)
- vendor_id (uuid, FK to vendor_profiles)
- document_type (enum: cac_document, cac_certificate, cac_memorandum, cac_status_report, id_document)
- document_url (text)
- verification_status (enum: pending, verified, rejected)
- uploaded_at (timestamp)
```

### vendor_bank_accounts
```sql
- id (uuid, PK)
- vendor_id (uuid, FK to vendor_profiles)
- bank_name (varchar)
- account_number (varchar, encrypted)
- account_name (varchar)
- bank_code (varchar)
- is_verified (boolean)
- created_at (timestamp)
```

### vendor_store_images
```sql
- id (uuid, PK)
- vendor_id (uuid, FK to vendor_profiles)
- image_url (text)
- display_order (int)
- uploaded_at (timestamp)
```

---

## API ENDPOINTS SUMMARY

### Authentication (auth-service)
- POST `/api/auth/vendor/register` - Create vendor account
- POST `/api/auth/vendor/verify-email` - Verify email OTP
- POST `/api/auth/vendor/resend-otp` - Resend OTP

### Vendor Management (platform-service)
- POST `/api/vendor/business-details` - Submit business information
- GET `/api/vendor/business-types` - Get business type options
- POST `/api/vendor/profile-picture` - Upload profile picture
- POST `/api/vendor/verify-nin` - Verify NIN
- POST `/api/vendor/id-documents` - Upload ID documents
- POST `/api/vendor/bank-account` - Add bank account
- GET `/api/vendor/banks` - Get supported banks list
- POST `/api/vendor/store-images` - Upload store images
- PATCH `/api/vendor/complete-registration` - Complete registration
- GET `/api/vendor/profile` - Get vendor profile

---

## NEXT STEPS

1. Review and approve this implementation plan
2. Create database migrations for vendor tables
3. Implement Phase 1 (Account Creation & Email Verification)
4. Test Phase 1 endpoints
5. Implement Phase 2 (Business Information & Verification)
6. Test Phase 2 endpoints
7. Implement Phase 3 (Bank Account & Store Setup)
8. Test Phase 3 endpoints
9. Integration testing
10. Update main food implementation document
11. Delete this temporary document

---

**IMPORTANT NOTES:**
- NO phone verification (email only)
- Leverage existing auth-service email functionality
- Use existing Supabase storage for file uploads
- Bank verification integration required (Paystack/Flutterwave)
- NIN verification can be manual admin approval initially
- All vendor APIs must go through gateway
- Vendor status workflow: pending → active/rejected (admin approval)
