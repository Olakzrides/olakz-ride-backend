# Storage Path Validation and File Existence Checks

## Overview
Improve the reliability and error handling of document storage and signed URL generation in the driver registration system.

## Problem Statement
Currently, the system generates signed URLs for documents without validating that the files actually exist in storage. This can lead to broken URLs being returned to admins and drivers when files are missing or have been deleted.

## User Stories

### 1. As an admin reviewing driver applications
**I want** to see clear error messages when document files are missing  
**So that** I can take appropriate action (request re-upload, contact driver, etc.)

**Acceptance Criteria:**
- 1.1 When viewing a driver application, if a document file is missing from storage, I see a clear error message
- 1.2 The error message indicates which specific document is missing
- 1.3 The system provides a "signedUrlError" field in the response for missing files
- 1.4 Missing files don't cause the entire API request to fail

### 2. As a system administrator
**I want** file existence to be validated before generating signed URLs  
**So that** we don't waste resources generating URLs for non-existent files

**Acceptance Criteria:**
- 2.1 Before generating a signed URL, the system checks if the file exists in Supabase Storage
- 2.2 If the file doesn't exist, the system returns a descriptive error instead of attempting to generate a URL
- 2.3 File existence checks are logged for audit purposes
- 2.4 The system handles Supabase Storage API errors gracefully

### 3. As a developer
**I want** consistent path handling across all document operations  
**So that** there are no path-related bugs or double-prefix issues

**Acceptance Criteria:**
- 3.1 All document paths follow the format: `{userId}/{documentType}/{uuid}.{ext}`
- 3.2 The bucket name is never included in the file path stored in the database
- 3.3 Path generation is centralized in one location (DocumentService)
- 3.4 Unit tests validate path generation logic

### 4. As a driver
**I want** to receive working document URLs when I request my uploaded documents  
**So that** I can view my submitted documents

**Acceptance Criteria:**
- 4.1 When I request a document URL, the system validates the file exists before generating the URL
- 4.2 If the file is missing, I receive a clear error message explaining the issue
- 4.3 The error message includes instructions on how to re-upload the document
- 4.4 Working signed URLs expire after 24 hours as documented

## Technical Requirements

### TR-1: File Existence Validation
- Add a `fileExists()` method to `StorageUtil` class
- Method should check if a file exists in Supabase Storage before generating signed URLs
- Method should handle Supabase API errors gracefully

### TR-2: Enhanced Error Handling
- Update `DocumentService.getSecureDocumentUrl()` to validate file existence
- Return descriptive error messages when files are missing
- Log all file access attempts (success and failure) for audit trail

### TR-3: Path Validation
- Add path validation to prevent double prefixes
- Validate that paths don't contain bucket name
- Add unit tests for path generation

### TR-4: Backward Compatibility
- Maintain support for existing documents with `document_url` field
- Gradually migrate to using `file_path` field exclusively
- Don't break existing API contracts

## Out of Scope
- Migration script for old documents (optional, can be done later)
- Automatic file cleanup for orphaned database records
- Document re-upload functionality (already exists)

## Success Metrics
- Zero "broken URL" errors reported by admins
- All signed URL generation attempts are logged
- File existence checks complete in < 100ms
- No regression in existing functionality
