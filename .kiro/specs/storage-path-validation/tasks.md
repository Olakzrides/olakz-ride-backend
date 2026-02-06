# Storage Path Validation - Implementation Tasks

## Task List

- [ ] 1. Add file existence validation to StorageUtil
  - [ ] 1.1 Implement `fileExists()` method in StorageUtil class
  - [ ] 1.2 Add error handling for Supabase Storage API errors
  - [ ] 1.3 Add logging for file existence checks
  - [ ] 1.4 Write unit tests for `fileExists()` method

- [ ] 2. Enhance DocumentService with file validation
  - [ ] 2.1 Update `getSecureDocumentUrl()` to call `fileExists()` before generating signed URL
  - [ ] 2.2 Add descriptive error messages for missing files
  - [ ] 2.3 Ensure audit logging captures file not found events
  - [ ] 2.4 Write unit tests for enhanced `getSecureDocumentUrl()`

- [ ] 3. Update AdminDriverController error handling
  - [ ] 3.1 Modify `getDriverForReview()` to catch file not found errors
  - [ ] 3.2 Add `signedUrlError` field to document response format
  - [ ] 3.3 Ensure partial failures don't crash the entire request
  - [ ] 3.4 Write integration tests for admin document viewing with missing files

- [ ] 4. Add path validation safeguards
  - [ ] 4.1 Add validation to ensure paths don't contain bucket name
  - [ ] 4.2 Add validation to ensure paths follow expected format
  - [ ] 4.3 Write unit tests for path validation

- [ ] 5. Testing and validation
  - [ ] 5.1 Test file upload → existence check → signed URL generation flow
  - [ ] 5.2 Test missing file scenario with clear error messages
  - [ ] 5.3 Test admin viewing driver with mix of valid and missing documents
  - [ ] 5.4 Verify no regression in existing functionality

## Task Details

### Task 1.1: Implement `fileExists()` method
**Description:** Add a new static method to StorageUtil that checks if a file exists in Supabase Storage.

**Implementation:**
```typescript
static async fileExists(filePath: string): Promise<boolean> {
  try {
    // Use Supabase Storage list API to check file existence
    const { data, error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .list(path.dirname(filePath), {
        search: path.basename(filePath)
      });

    if (error) {
      logger.warn('File existence check failed:', { filePath, error: error.message });
      return false;
    }

    return data && data.length > 0;
  } catch (error: any) {
    logger.error('File existence check error:', { filePath, error: error.message });
    return false;
  }
}
```

**Acceptance Criteria:**
- Method returns `true` for existing files
- Method returns `false` for non-existent files
- Method handles errors gracefully without throwing
- All checks are logged

### Task 1.4: Write unit tests for `fileExists()`
**Test Cases:**
1. Existing file returns `true`
2. Non-existent file returns `false`
3. Network error returns `false` and logs warning
4. Invalid path returns `false` and logs error

### Task 2.1: Update `getSecureDocumentUrl()` with validation
**Description:** Add file existence check before generating signed URL.

**Implementation:**
```typescript
async getSecureDocumentUrl(...): Promise<string> {
  try {
    // Get document metadata
    const { data: document, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      throw new Error('Document not found');
    }

    const filePath = document.file_path || document.document_url;

    // NEW: Check if file exists before generating signed URL
    const exists = await StorageUtil.fileExists(filePath);
    if (!exists) {
      throw new Error('Document file not found in storage. The file may have been deleted or moved. Please re-upload the document.');
    }

    // Generate signed URL
    const { data, error: signedUrlError } = await supabase.storage
      .from('driver-documents')
      .createSignedUrl(filePath, expiresIn);

    if (signedUrlError) {
      throw new Error(`Failed to generate signed URL: ${signedUrlError.message}`);
    }

    // Log document access
    await DocumentAccessLogService.logAccess({
      documentId,
      userId,
      action: 'view',
      ipAddress,
      userAgent,
      metadata: { expiresIn, fileName: document.file_name },
    });

    return data.signedUrl;
  } catch (error: any) {
    logger.error('Get secure document URL error:', error);
    throw error;
  }
}
```

**Acceptance Criteria:**
- File existence is checked before generating signed URL
- Clear error message when file is missing
- Existing functionality is not broken

### Task 3.1: Modify `getDriverForReview()` error handling
**Description:** Update controller to handle missing files gracefully.

**Implementation:**
```typescript
// Generate signed URLs for documents
const documentsWithUrls = await Promise.all(
  (driver.documents || []).map(async (doc) => {
    let signedUrl = null;
    let signedUrlError = null;
    
    try {
      signedUrl = await this.documentService.getSecureDocumentUrl(
        doc.id,
        req.user?.id || 'admin',
        24 * 60 * 60,
        req.ip,
        req.get('User-Agent')
      );
    } catch (error: any) {
      logger.warn('Could not generate signed URL for document:', {
        documentId: doc.id,
        error: error.message,
      });
      signedUrlError = error.message;
    }

    return {
      ...doc,
      signedUrl,
      signedUrlError,
    };
  })
);
```

**Acceptance Criteria:**
- Missing files don't crash the request
- Each document has either `signedUrl` or `signedUrlError`
- All documents are returned (even those with errors)

### Task 4.1: Add path validation
**Description:** Add validation to prevent path-related bugs.

**Implementation:**
```typescript
// In DocumentService.generateDocumentPath()
generateDocumentPath(userId: string, documentType: string): string {
  // Validate inputs
  if (!userId || !documentType) {
    throw new Error('userId and documentType are required');
  }

  // Ensure no bucket name in path
  if (userId.includes('driver-documents') || documentType.includes('driver-documents')) {
    throw new Error('Path must not contain bucket name');
  }

  // Generate clean path
  const path = `${userId}/${documentType}`;

  // Validate format
  if (path.includes('//') || path.startsWith('/')) {
    throw new Error('Invalid path format');
  }

  return path;
}
```

**Acceptance Criteria:**
- Paths never contain bucket name
- Paths follow expected format
- Invalid inputs throw clear errors

### Task 5.3: Integration test for mixed document states
**Test Scenario:**
1. Create driver with 3 documents
2. Upload files for all 3 documents
3. Delete 1 file from storage (but keep database record)
4. Admin requests driver details
5. Verify response contains:
   - 3 documents total
   - 2 with valid `signedUrl`
   - 1 with `signedUrlError`
6. Verify HTTP status is 200 (success)

## Dependencies
- Task 2 depends on Task 1 (DocumentService needs StorageUtil.fileExists())
- Task 3 depends on Task 2 (Controller needs enhanced DocumentService)
- Task 5 depends on Tasks 1-4 (testing requires all implementations)

## Estimated Time
- Task 1: 2 hours
- Task 2: 2 hours
- Task 3: 1.5 hours
- Task 4: 1 hour
- Task 5: 2 hours
- **Total: 8.5 hours**

## Success Criteria
- All unit tests pass
- All integration tests pass
- No regression in existing functionality
- Admin can view drivers with missing documents without errors
- Clear error messages for all failure cases
