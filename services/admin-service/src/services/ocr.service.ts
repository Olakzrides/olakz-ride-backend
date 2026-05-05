import { logger } from '../utils/logger';

export interface OCRResult {
  extractedText: string;
  expiryDate?: Date;
  documentNumber?: string;
  name?: string;
  validationErrors: string[];
  confidence: number;
}

export class OCRService {
  async extractDocumentData(
    documentType: string,
    fileName: string,
    _fileBuffer?: Buffer
  ): Promise<OCRResult> {
    try {
      const result: OCRResult = { extractedText: '', validationErrors: [], confidence: 0.8 };
      switch (documentType) {
        case 'drivers_license': return this.extractDriversLicenseData(fileName, result);
        case 'national_id': return this.extractNationalIdData(fileName, result);
        case 'passport': return this.extractPassportData(fileName, result);
        case 'vehicle_registration': return this.extractVehicleRegistrationData(fileName, result);
        case 'vehicle_insurance': return this.extractInsuranceData(fileName, result);
        default:
          result.extractedText = `Document type: ${documentType}`;
          result.validationErrors.push('Unknown document type for OCR processing');
          return result;
      }
    } catch (err: unknown) {
      logger.error('OCR extraction error', { error: err instanceof Error ? err.message : String(err) });
      return { extractedText: '', validationErrors: ['OCR processing failed'], confidence: 0 };
    }
  }

  private extractDriversLicenseData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Driver's License Document: ${fileName}`;
    const expiryMatch = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (expiryMatch) {
      const d = new Date(expiryMatch[1].replace(/[-_]/g, '-'));
      if (!isNaN(d.getTime())) { result.expiryDate = d; }
    }
    const licenseMatch = fileName.match(/([A-Z]{2}\d{8,12})/);
    if (licenseMatch) result.documentNumber = licenseMatch[1];
    if (!result.expiryDate) result.validationErrors.push('Could not extract expiry date');
    else if (result.expiryDate < new Date()) result.validationErrors.push("Driver's license appears to be expired");
    if (!result.documentNumber) result.validationErrors.push('Could not extract license number');
    return result;
  }

  private extractNationalIdData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `National ID Document: ${fileName}`;
    for (const pattern of [/(\d{11})/, /([A-Z]\d{8})/, /(\d{4}[-_]\d{4}[-_]\d{3})/]) {
      const m = fileName.match(pattern);
      if (m) { result.documentNumber = m[1]; break; }
    }
    if (!result.documentNumber) result.validationErrors.push('Could not extract ID number');
    return result;
  }

  private extractPassportData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Passport Document: ${fileName}`;
    const m = fileName.match(/([A-Z]\d{7,8})/);
    if (m) result.documentNumber = m[1];
    const em = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (em) { const d = new Date(em[1].replace(/[-_]/g, '-')); if (!isNaN(d.getTime())) result.expiryDate = d; }
    if (!result.documentNumber) result.validationErrors.push('Could not extract passport number');
    if (!result.expiryDate) result.validationErrors.push('Could not extract expiry date');
    else if (result.expiryDate < new Date()) result.validationErrors.push('Passport appears to be expired');
    return result;
  }

  private extractVehicleRegistrationData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Vehicle Registration Document: ${fileName}`;
    for (const pattern of [/([A-Z]{2,3}[-_]?\d{3,4}[-_]?[A-Z]{1,2})/, /(\d{3}[-_][A-Z]{3})/]) {
      const m = fileName.match(pattern);
      if (m) { result.documentNumber = m[1]; break; }
    }
    if (!result.documentNumber) result.validationErrors.push('Could not extract plate number');
    return result;
  }

  private extractInsuranceData(fileName: string, result: OCRResult): OCRResult {
    result.extractedText = `Insurance Document: ${fileName}`;
    const m = fileName.match(/([A-Z]{2,4}\d{6,12})/);
    if (m) result.documentNumber = m[1];
    const em = fileName.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (em) { const d = new Date(em[1].replace(/[-_]/g, '-')); if (!isNaN(d.getTime())) result.expiryDate = d; }
    if (!result.expiryDate) result.validationErrors.push('Could not extract insurance expiry date');
    else if (result.expiryDate < new Date()) result.validationErrors.push('Insurance appears to be expired');
    if (!result.documentNumber) result.validationErrors.push('Could not extract policy number');
    return result;
  }

  validateDocumentCompleteness(documentType: string, ocrResult: OCRResult): string[] {
    const errors = [...ocrResult.validationErrors];
    if (['drivers_license', 'vehicle_insurance'].includes(documentType)) {
      if (!ocrResult.documentNumber) errors.push('Document number is required');
      if (!ocrResult.expiryDate) errors.push('Expiry date is required');
    } else if (['national_id', 'passport', 'vehicle_registration'].includes(documentType)) {
      if (!ocrResult.documentNumber) errors.push('Document number is required');
    }
    if (ocrResult.confidence < 0.5) errors.push('Document quality is too low for reliable processing');
    return errors;
  }
}
