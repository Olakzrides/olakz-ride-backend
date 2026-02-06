# Storage Path Validation - Design Document

## Architecture Overview

This feature enhances the existing document storage system by adding file existence validation and improved error handling. The changes are focused on two main classes:

1. **StorageUtil** - Add file existence checking capability
2. **DocumentService** - Enhance signed URL generation with validation

## Component Design

### 1. StorageUtil Enhancements

#### New Method: `fileExists()`

```typescript
/**
 * Check if a file exists in Supabase Storage
 * @param filePath - The path to the file in storage (without bucket name)
 * @returns Promise<boolean> - True if file exists, false otherwise
 */
static async fileExists(filePath: string): Promise<boolean>
```

**Implementation Details:**
- Use Supabase Storage `list()` API to check file existence
- Handle API errors gracefully (network issues, permission errors)
- Log all checks for audit trail
- Return `false` for any errors (fail-safe approach)

**Error Handling:**
- Network errors → return `false`, log warning
- Permission errors → return `false`, log error
- Invalid path → return `false`, log error

### 2. DocumentService Enhancements

#### Enhanced Method: `getSecureDocumentUrl()`

**Current Signature:**
```typescript
async getSecureDocumentUrl(
  documentId: string, 
  userId: string, 
  expiresIn: number = 24 * 60 * 60,
  ipAddress?: string,
  userAgent?: string
): Promise<string>
```

**New Behavior:**
1. Fetch document metadata from database
2. **NEW:** Validate file exists in storage using `StorageUtil.fileExists()`
3. If file doesn't exist, throw descriptive error
4. Generate signed URL
5. Log access attempt

**Error Messages:**
- File not found: `"Document file not found in storage. The file may have been deleted or moved. Please re-upload the document."`
- Database error: `"Document metadata not found"`
- Permission error: `"Access denied to document"`

### 3. AdminDriverController Enhancements

#### Enhanced Method: `getDriverForReview()`

**Current Behavior:**
- Fetches driver data
- Generates signed URLs for all documents
- Returns driver with document URLs

**New Behavior:**
- Fetches driver data
- For each document:
  - Try to generate signed URL
  - If file doesn't exist, catch error and add to `signedUrlError` field
  - Continue processing other documents
- Return driver with mix of working URLs and error messages

**Response Format:**
```typescript
{
  driver: {
    documents: [
      {
        id: "doc-123",
        type: "drivers_license",
        signedUrl: "https://...",  // Working URL
        signedUrlError: null
      },
      {
        id: "doc-456",
        type: "vehicle_registration",
        signedUrl: null,
        signedUrlError: "Document file not found in storage"  // Error case
      }
    ]
  }
}
```

## Data Flow

### Successful Document Access Flow
```
1. Admin requests driver details
   ↓
2. Controller fetches driver + documents from DB
   ↓
3. For each document:
   a. DocumentService.getSecureDocumentUrl()
   b. StorageUtil.fileExists() → true
   c. Generate signed URL
   d. Log access
   ↓
4. Return driver with signed URLs
```

### Missing File Flow
```
1. Admin requests driver details
   ↓
2. Controller fetches driver + documents from DB
   ↓
3. For each document:
   a. DocumentService.getSecureDocumentUrl()
   b. StorageUtil.fileExists() → false
   c. Throw error "Document file not found"
   d. Controller catches error
   e. Set signedUrlError field
   ↓
4. Return driver with error messages for missing files
```

## Database Schema

No database changes required. Existing schema is sufficient:

```sql
-- driver_documents table (existing)
CREATE TABLE driver_documents (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  session_id UUID REFERENCES driver_registration_sessions(id),
  document_type TEXT NOT NULL,
  file_path TEXT,  -- Used for signed URL generation
  document_url TEXT,  -- Legacy field, fallback
  status TEXT DEFAULT 'pending',
  -- ... other fields
);
```

## API Changes

### No Breaking Changes
All API endpoints maintain backward compatibility. The only change is enhanced error handling:

**Before:**
```json
{
  "documents": [
    {
      "id": "doc-123",
      "signedUrl": null  // Silent failure
    }
  ]
}
```

**After:**
```json
{
  "documents": [
    {
      "id": "doc-123",
      "signedUrl": null,
      "signedUrlError": "Document file not found in storage"  // Clear error
    }
  ]
}
```

## Error Handling Strategy

### Principle: Fail Gracefully
- Never let a missing file crash the entire request
- Always provide clear, actionable error messages
- Log all errors for debugging

### Error Categories

1. **File Not Found** (Expected)
   - HTTP Status: 200 (request succeeded, but file missing)
   - Response: Include `signedUrlError` field
   - Log Level: WARNING

2. **Database Error** (Unexpected)
   - HTTP Status: 500
   - Response: Generic error message
   - Log Level: ERROR

3. **Storage API Error** (Unexpected)
   - HTTP Status: 500
   - Response: Generic error message
   - Log Level: ERROR

## Performance Considerations

### File Existence Check Performance
- Supabase Storage `list()` API: ~50-100ms per call
- Impact: Minimal (only called when generating signed URLs)
- Optimization: Could add caching layer in future if needed

### Batch Operations
- When checking multiple documents, checks run in parallel
- Use `Promise.all()` for concurrent checks
- Total time ≈ slowest individual check (not sum of all checks)

## Security Considerations

### Access Control
- File existence checks respect Supabase Storage RLS policies
- Only authorized users can check file existence
- Signed URLs maintain 24-hour expiry

### Information Disclosure
- Error messages don't reveal internal system details
- File paths are never exposed to unauthorized users
- Audit logs track all access attempts

## Testing Strategy

### Unit Tests
1. `StorageUtil.fileExists()`
   - Test with existing file → returns `true`
   - Test with non-existent file → returns `false`
   - Test with network error → returns `false`, logs warning
   - Test with invalid path → returns `false`, logs error

2. `DocumentService.getSecureDocumentUrl()`
   - Test with existing file → returns signed URL
   - Test with missing file → throws descriptive error
   - Test with invalid document ID → throws error

### Integration Tests
1. Upload document → verify file exists → generate signed URL → access file
2. Upload document → delete file from storage → attempt to generate URL → verify error message
3. Admin views driver with missing documents → verify partial success response

## Rollout Plan

### Phase 1: Add File Existence Validation (This Spec)
- Add `StorageUtil.fileExists()` method
- Enhance `DocumentService.getSecureDocumentUrl()`
- Update `AdminDriverController.getDriverForReview()`
- Add unit tests

### Phase 2: Optional Enhancements (Future)
- Add caching layer for file existence checks
- Create migration script to fix old documents
- Add automatic cleanup for orphaned records
- Add document re-upload UI for admins

## Correctness Properties

### Property 1: File Existence Consistency
**Statement:** If `StorageUtil.fileExists(path)` returns `true`, then `StorageUtil.getSignedUrl(path)` must succeed.

**Validation:** Property-based test that:
1. Uploads a random file
2. Verifies `fileExists()` returns `true`
3. Verifies `getSignedUrl()` succeeds
4. Verifies the signed URL is accessible

### Property 2: Error Message Clarity
**Statement:** When a document file is missing, the error message must contain the phrase "not found" and suggest re-uploading.

**Validation:** Unit test that:
1. Creates document metadata without uploading file
2. Attempts to generate signed URL
3. Verifies error message contains "not found"
4. Verifies error message contains "re-upload"

### Property 3: Partial Failure Resilience
**Statement:** If N documents exist for a driver and M files are missing (M < N), the API must return N documents with (N-M) working URLs and M error messages.

**Validation:** Integration test that:
1. Creates driver with 3 documents
2. Deletes 1 file from storage
3. Requests driver details
4. Verifies response contains 3 documents
5. Verifies 2 have `signedUrl` and 1 has `signedUrlError`

## Implementation Notes

### Code Locations
- `services/core-logistics/src/utils/storage.util.ts` - Add `fileExists()` method
- `services/core-logistics/src/services/document.service.ts` - Enhance `getSecureDocumentUrl()`
- `services/core-logistics/src/controllers/admin-driver.controller.ts` - Update error handling

### Dependencies
- No new dependencies required
- Uses existing Supabase Storage SDK

### Backward Compatibility
- All changes are additive (no breaking changes)
- Existing API contracts maintained
- Legacy `document_url` field still supported as fallback
