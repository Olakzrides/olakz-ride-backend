import { logger } from '../config/logger';

export interface OCRResult {
  extractedText: string;
  expiryDate?: Date;
  documentNumber?: string;
  name?: string;
  validationErrors: string[];
  confidence: number;
}

export class OCRService {
  /**
   * Extract text and key information from document using regex patterns
   * This is a simple implementation - can be enhanced with cloud OCR later
   */
  async extractDocumentData(
    documentType: string,
    fileName: string,
    _fileBuffer?: Buffer // Prefixed with underscore to indicate intentionally unused
  ): Promise<OCRResult> {
    try {
      // For Phase 2B, we'll use simple regex patterns on filename and mock OCR
      // In production, this would process the actual image/PDF content
      
      const result: OCRResult = {
        extractedText: '',
        validationErrors: [],
        confidence: 0.8, // Mock confidence score
      };

      // Extract information based on document type
      switch (documentType) {
        case 'drivers_license':
          return this.extractDriversLicenseData(fileName, result);
        
        case 'national_id':
          return this.extractNationalIdData(fileName, result);
        
        case 'passport':
          return this.extractPassportData(fileName, result);
        
        case 'vehicle_registration':
          return this.extractVehicleRegistrationData(fileName, result);
        
        case 'vehicle_insurance':
          return this.extractInsuranceData(fileName, result);
        
        default:
          result.extractedText = `Document type: ${documentType}`;
          result.validationErrors.push('Unknown document type for OCR processing');
          return result;
      }
    } catch (error: any) {
      logger.error('OCR extraction error:', error);
      return {
        extractedText: '',
        validationErrors: [`OCR processing failed: ${error.message}`],
        confidence: 0,
      };
    }
  }

  /**
   * Extract data from driver's license
   */
  private extractDriversLicenseData(fileName: string, result: OCRResult): OCRResult {
    // Mock OCR data extraction - in production, this would analyze the actual image
    result.extractedText = `Driver's License Document: ${fileName}`;
    
    // Try to extract expiry date from filename patterns
    const expiryMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (expiryMatch) {
      const dateStr = expiryMatch[1].replace(/[-_]/g, '-');
      const expiryDate = new Date(dateStr);
      if (!isNaN(expiryDate.getTime())) {
        result.expiryDate = expiryDate;
        result.extractedText += `\nExpiry Date: ${dateStr}`;
      }
    }

    // Extract license number patterns
    const licenseMatch = fileName.match(/([A-Z]{2}\d{8,12})/);
    if (licenseMatch) {
      result.documentNumber = licenseMatch[1];
      result.extractedText += `\nLicense Number: ${licenseMatch[1]}`;
    }

    // Validation checks
    if (!result.expiryDate) {
      result.validationErrors.push('Could not extract expiry date from document');
    } else if (result.expiryDate < new Date()) {
      result.validationErrors.push('Driver\'s license appears to be expired');
    }

    if (!result.documentNumber) {
      result.validationErrors.push('Could not extract license number from document');
    }

    return result;
  }

  /**
   * Extract data from national ID
   */
  private extractNationalIdData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `National ID Document: ${fileName}`;
    
    // Extract ID number patterns (various formats)
    const idPatterns = [
      /(\d{11})/,  // 11-digit ID
      /([A-Z]\d{8})/,  // Letter + 8 digits
      /(\d{4}[-_]\d{4}[-_]\d{3})/,  // Formatted ID
    ];

    for (const pattern of idPatterns) {
      const match = fileName.match(pattern);
      if (match) {
        result.documentNumber = match[1];
        result.extractedText += `\nID Number: ${match[1]}`;
        break;
      }
    }

    // Extract birth date if present
    const birthMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (birthMatch) {
      const dateStr = birthMatch[1].replace(/[-_]/g, '-');
      result.extractedText += `\nBirth Date: ${dateStr}`;
    }

    if (!result.documentNumber) {
      result.validationErrors.push('Could not extract ID number from document');
    }

    return result;
  }

  /**
   * Extract data from passport
   */
  private extractPassportData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Passport Document: ${fileName}`;
    
    // Extract passport number patterns
    const passportMatch = fileName.match(/([A-Z]\d{7,8})/);
    if (passportMatch) {
      result.documentNumber = passportMatch[1];
      result.extractedText += `\nPassport Number: ${passportMatch[1]}`;
    }

    // Extract expiry date
    const expiryMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (expiryMatch) {
      const dateStr = expiryMatch[1].replace(/[-_]/g, '-');
      const expiryDate = new Date(dateStr);
      if (!isNaN(expiryDate.getTime())) {
        result.expiryDate = expiryDate;
        result.extractedText += `\nExpiry Date: ${dateStr}`;
      }
    }

    // Validation
    if (!result.documentNumber) {
      result.validationErrors.push('Could not extract passport number from document');
    }

    if (!result.expiryDate) {
      result.validationErrors.push('Could not extract expiry date from document');
    } else if (result.expiryDate < new Date()) {
      result.validationErrors.push('Passport appears to be expired');
    }

    return result;
  }

  /**
   * Extract data from vehicle registration
   */
  private extractVehicleRegistrationData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Vehicle Registration Document: ${fileName}`;
    
    // Extract plate number patterns
    const platePatterns = [
      /([A-Z]{2,3}[-_]?\d{3,4}[-_]?[A-Z]{1,2})/,  // Standard plate format
      /(\d{3}[-_][A-Z]{3})/,  // Alternative format
    ];

    for (const pattern of platePatterns) {
      const match = fileName.match(pattern);
      if (match) {
        result.documentNumber = match[1];
        result.extractedText += `\nPlate Number: ${match[1]}`;
        break;
      }
    }

    // Extract registration expiry
    const expiryMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (expiryMatch) {
      const dateStr = expiryMatch[1].replace(/[-_]/g, '-');
      const expiryDate = new Date(dateStr);
      if (!isNaN(expiryDate.getTime())) {
        result.expiryDate = expiryDate;
        result.extractedText += `\nRegistration Expiry: ${dateStr}`;
      }
    }

    if (!result.documentNumber) {
      result.validationErrors.push('Could not extract plate number from document');
    }

    return result;
  }

  /**
   * Extract data from insurance document
   */
  private extractInsuranceData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Insurance Document: ${fileName}`;
    
    // Extract policy number
    const policyMatch = fileName.match(/([A-Z]{2,4}\d{6,12})/);
    if (policyMatch) {
      result.documentNumber = policyMatch[1];
      result.extractedText += `\nPolicy Number: ${policyMatch[1]}`;
    }

    // Extract expiry date
    const expiryMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (expiryMatch) {
      const dateStr = expiryMatch[1].replace(/[-_]/g, '-');
      const expiryDate = new Date(dateStr);
      if (!isNaN(expiryDate.getTime())) {
        result.expiryDate = expiryDate;
        result.extractedText += `\nInsurance Expiry: ${dateStr}`;
      }
    }

    // Validation
    if (!result.expiryDate) {
      result.validationErrors.push('Could not extract insurance expiry date');
    } else if (result.expiryDate < new Date()) {
      result.validationErrors.push('Insurance appears to be expired');
    }

    if (!result.documentNumber) {
      result.validationErrors.push('Could not extract policy number from document');
    }

    return result;
  }

  /**
   * Validate document completeness based on type
   */
  validateDocumentCompleteness(documentType: string, ocrResult: OCRResult): string[] {
    const errors: string[] = [...ocrResult.validationErrors];

    // Document-specific validation rules
    switch (documentType) {
      case 'drivers_license':
        if (!ocrResult.documentNumber) {
          errors.push('Driver\'s license number is required');
        }
        if (!ocrResult.expiryDate) {
          errors.push('Driver\'s license expiry date is required');
        }
        break;

      case 'vehicle_registration':
        if (!ocrResult.documentNumber) {
          errors.push('Vehicle plate number is required');
        }
        break;

      case 'vehicle_insurance':
        if (!ocrResult.documentNumber) {
          errors.push('Insurance policy number is required');
        }
        if (!ocrResult.expiryDate) {
          errors.push('Insurance expiry date is required');
        }
        break;

      case 'national_id':
      case 'passport':
        if (!ocrResult.documentNumber) {
          errors.push('Document number is required');
        }
        break;
    }

    // General validation
    if (ocrResult.confidence < 0.5) {
      errors.push('Document quality is too low for reliable processing');
    }

    return errors;
  }
}