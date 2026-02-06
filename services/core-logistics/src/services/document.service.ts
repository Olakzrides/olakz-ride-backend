import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { DocumentAccessLogService } from './document-access-log.service';
import { OCRService } from './ocr.service';
import { StorageUtil } from '../utils/storage.util';

export interface DocumentMetadata {
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentUrl: string;
  signedUrl?: string;
  filePath: string;
}

export interface CreateDocumentParams {
  driverId?: string;
  sessionId: string;
  userId: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentUrl: string;
  signedUrl?: string;
  filePath: string;
  ipAddress?: string;
  userAgent?: string;
  fileBuffer?: Buffer; // For OCR processing
}

export interface DocumentReplacement {
  originalDocumentId: string;
  newFileName: string;
  newFileSize: number;
  newMimeType: string;
  newDocumentUrl: string;
  newFilePath: string;
  replacementReason: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

export class DocumentService {
  private ocrService: OCRService;

  constructor() {
    this.ocrService = new OCRService();
  }

  /**
   * Save document metadata to database with access logging and OCR processing
   */
  async createDocument(params: CreateDocumentParams): Promise<any> {
    try {
      // Process OCR if file buffer is provided
      let ocrData = {};
      let extractedText = '';
      let expiryDateExtracted = null;
      let validationErrors: string[] = [];

      if (params.fileBuffer) {
        const ocrResult = await this.ocrService.extractDocumentData(
          params.documentType,
          params.fileName,
          params.fileBuffer
        );

        ocrData = {
          confidence: ocrResult.confidence,
          documentNumber: ocrResult.documentNumber,
          name: ocrResult.name,
        };
        extractedText = ocrResult.extractedText;
        expiryDateExtracted = ocrResult.expiryDate;
        validationErrors = this.ocrService.validateDocumentCompleteness(
          params.documentType,
          ocrResult
        );
      }

      const { data: document, error } = await supabase
        .from('driver_documents')
        .insert({
          driver_id: params.driverId || null, // Allow null during registration
          session_id: params.sessionId, // Link to registration session
          document_type: params.documentType,
          document_url: params.documentUrl,
          file_name: params.fileName,
          file_size: params.fileSize,
          mime_type: params.mimeType,
          file_path: params.filePath,
          status: 'pending',
          version_number: 1,
          is_current_version: true,
          ocr_data: ocrData,
          extracted_text: extractedText,
          expiry_date_extracted: expiryDateExtracted,
          validation_errors: validationErrors,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('Create document error:', error);
        throw new Error(`Failed to save document metadata: ${error.message}`);
      }

      // Log document upload for audit trail
      await DocumentAccessLogService.logAccess({
        documentId: document.id,
        userId: params.userId,
        action: 'upload',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          fileName: params.fileName,
          fileSize: params.fileSize,
          mimeType: params.mimeType,
          documentType: params.documentType,
          ocrProcessed: !!params.fileBuffer,
          validationErrors: validationErrors.length,
        },
      });

      logger.info('Document metadata saved with OCR and audit log:', {
        documentId: document.id,
        documentType: params.documentType,
        fileName: params.fileName,
        userId: params.userId,
        sessionId: params.sessionId,
        ocrProcessed: !!params.fileBuffer,
        validationErrors: validationErrors.length,
      });

      return document;
    } catch (error: any) {
      logger.error('Create document error:', error);
      throw error;
    }
  }

  /**
   * Replace/retake a document (creates new version)
   */
  async replaceDocument(replacementData: DocumentReplacement): Promise<any> {
    try {
      const { originalDocumentId, replacementReason, userId } = replacementData;

      // Get original document
      const { data: originalDoc, error: fetchError } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('id', originalDocumentId)
        .single();

      if (fetchError || !originalDoc) {
        throw new Error('Original document not found');
      }

      // Mark original document as not current
      const { error: updateError } = await supabase
        .from('driver_documents')
        .update({
          is_current_version: false,
          replaced_at: new Date().toISOString(),
          replacement_reason: replacementReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', originalDocumentId);

      if (updateError) {
        throw new Error(`Failed to update original document: ${updateError.message}`);
      }

      // Create new document version
      const newVersionNumber = originalDoc.version_number + 1;

      const { data: newDocument, error: createError } = await supabase
        .from('driver_documents')
        .insert({
          driver_id: originalDoc.driver_id,
          session_id: originalDoc.session_id,
          document_type: originalDoc.document_type,
          document_url: replacementData.newDocumentUrl,
          file_name: replacementData.newFileName,
          file_size: replacementData.newFileSize,
          mime_type: replacementData.newMimeType,
          file_path: replacementData.newFilePath,
          status: 'pending',
          version_number: newVersionNumber,
          parent_document_id: originalDocumentId,
          is_current_version: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create new document version: ${createError.message}`);
      }

      // Log document replacement
      await DocumentAccessLogService.logAccess({
        documentId: newDocument.id,
        userId,
        action: 'upload',
        ipAddress: replacementData.ipAddress,
        userAgent: replacementData.userAgent,
        metadata: {
          action: 'replacement',
          originalDocumentId,
          versionNumber: newVersionNumber,
          replacementReason,
          fileName: replacementData.newFileName,
        },
      });

      logger.info('Document replaced successfully:', {
        originalDocumentId,
        newDocumentId: newDocument.id,
        versionNumber: newVersionNumber,
        userId,
        replacementReason,
      });

      return newDocument;
    } catch (error: any) {
      logger.error('Replace document error:', error);
      throw error;
    }
  }

  /**
   * Get documents by session ID (for registration process)
   */
  async getDocumentsBySession(sessionId: string): Promise<any[]> {
    try {
      const { data: documents, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_current_version', true) // Only get current versions
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Get documents by session error:', error);
        return [];
      }

      return documents || [];
    } catch (error: any) {
      logger.error('Get documents by session error:', error);
      return [];
    }
  }

  /**
   * Delete document and its file
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('driver_documents')
        .delete()
        .eq('id', documentId);

      if (error) {
        logger.error('Delete document error:', error);
        return false;
      }

      return true;
    } catch (error: any) {
      logger.error('Delete document error:', error);
      return false;
    }
  }

  /**
   * Update document status
   */
  async updateDocumentStatus(
    documentId: string, 
    status: 'pending' | 'approved' | 'rejected',
    notes?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('driver_documents')
        .update({
          status,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) {
        logger.error('Update document status error:', error);
        return false;
      }

      return true;
    } catch (error: any) {
      logger.error('Update document status error:', error);
      return false;
    }
  }

  /**
   * Validate document requirements
   */
  validateDocumentType(documentType: string): boolean {
    const validTypes = [
      'drivers_license',
      'vehicle_registration',
      'vehicle_insurance',
      'profile_photo',
      'vehicle_photo',
      'national_id',
      'passport',
    ];

    return validTypes.includes(documentType);
  }

  /**
   * Generate folder path for document storage
   */
  generateDocumentPath(userId: string, documentType: string): string {
    // Validate inputs
    if (!userId || !documentType) {
      throw new Error('userId and documentType are required for path generation');
    }

    // Ensure no bucket name in path components
    if (userId.includes('driver-documents') || documentType.includes('driver-documents')) {
      throw new Error('Path components must not contain bucket name');
    }

    // Generate clean path
    const path = `${userId}/${documentType}`;

    // Validate format
    if (path.includes('//') || path.startsWith('/')) {
      throw new Error('Invalid path format generated');
    }

    return path;
  }

  /**
   * Get secure signed URL for document access
   */
  async getSecureDocumentUrl(
    documentId: string, 
    userId: string, 
    expiresIn: number = 24 * 60 * 60,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
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

      // Get file path (prefer file_path over document_url)
      const filePath = document.file_path || document.document_url;
      
      if (!filePath) {
        throw new Error('Document file path is missing');
      }

      // Validate file path format
      const pathValidation = StorageUtil.validateFilePath(filePath);
      if (!pathValidation.isValid) {
        logger.warn('Invalid file path format:', {
          documentId,
          filePath,
          error: pathValidation.error,
        });
        throw new Error(`Invalid file path: ${pathValidation.error}`);
      }

      // Check if file exists in storage before generating signed URL
      const fileExists = await StorageUtil.fileExists(filePath);
      if (!fileExists) {
        logger.warn('Document file not found in storage:', {
          documentId,
          filePath,
          userId,
        });
        throw new Error('Document file not found in storage. The file may have been deleted or moved. Please re-upload the document.');
      }

      // Generate signed URL from file path
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
        metadata: {
          expiresIn,
          fileName: document.file_name,
          fileExists: true,
        },
      });

      logger.info('Secure document URL generated:', {
        documentId,
        userId,
        fileName: document.file_name,
        expiresIn,
      });

      return data.signedUrl;
    } catch (error: any) {
      logger.error('Get secure document URL error:', error);
      
      // Log failed access attempt with error in metadata
      try {
        await DocumentAccessLogService.logAccess({
          documentId,
          userId,
          action: 'view',
          ipAddress,
          userAgent,
          metadata: {
            success: false,
            error: error.message,
          },
        });
      } catch (logError) {
        // Don't throw if logging fails
        logger.error('Failed to log access error:', logError);
      }
      
      throw error;
    }
  }

  /**
   * Validate document ownership and access rights
   */
  async validateDocumentAccess(documentId: string, userId: string): Promise<boolean> {
    try {
      const { data: document, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error || !document) {
        return false;
      }

      // Check if user owns the document (via session or driver)
      if (document.session_id) {
        // Check session ownership
        const { data: session, error: sessionError } = await supabase
          .from('driver_registration_sessions')
          .select('user_id')
          .eq('id', document.session_id)
          .single();

        return !sessionError && session?.user_id === userId;
      }

      // TODO: Add driver ownership check when driver records are linked
      return false;
    } catch (error) {
      logger.error('Validate document access error:', error);
      return false;
    }
  }

  /**
   * Get document with OCR data
   */
  async getDocumentWithOCR(documentId: string): Promise<any> {
    try {
      const { data: document, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error || !document) {
        return null;
      }

      return document;
    } catch (error: any) {
      logger.error('Get document with OCR error:', error);
      return null;
    }
  }

  /**
   * Update document OCR data
   */
  async updateDocumentOCR(
    documentId: string,
    ocrData: any,
    extractedText: string,
    expiryDate?: Date,
    validationErrors: string[] = []
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('driver_documents')
        .update({
          ocr_data: ocrData,
          extracted_text: extractedText,
          expiry_date_extracted: expiryDate,
          validation_errors: validationErrors,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) {
        logger.error('Update document OCR error:', error);
        return false;
      }

      return true;
    } catch (error: any) {
      logger.error('Update document OCR error:', error);
      return false;
    }
  }
}