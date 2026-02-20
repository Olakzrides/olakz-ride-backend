/**
 * Unit Tests for AuthCodeService
 * Tests authentication code generation and validation
 */

import { AuthCodeService } from '../services/auth-code.service';

describe('AuthCodeService', () => {
  describe('generateUniqueCode', () => {
    it('should generate a code with correct format', async () => {
      const pickupCode = await AuthCodeService.generateUniqueCode('pickup');
      
      expect(pickupCode).toBeDefined();
      expect(typeof pickupCode).toBe('string');
      expect(pickupCode.length).toBe(11); // XXX-XXX-XXX
      expect(pickupCode.split('-').length).toBe(3);
    });

    it('should generate different codes for pickup and delivery', async () => {
      const pickupCode = await AuthCodeService.generateUniqueCode('pickup');
      const deliveryCode = await AuthCodeService.generateUniqueCode('delivery');

      expect(pickupCode).not.toBe(deliveryCode);
    });

    it('should generate codes that pass format validation', async () => {
      const code = await AuthCodeService.generateUniqueCode('pickup');
      
      expect(AuthCodeService.validateCodeFormat(code)).toBe(true);
    });
  });

  describe('generateDeliveryCodes', () => {
    it('should generate both pickup and delivery codes', async () => {
      const codes = await AuthCodeService.generateDeliveryCodes();

      expect(codes).toBeDefined();
      expect(codes.pickupCode).toBeDefined();
      expect(codes.deliveryCode).toBeDefined();
      expect(codes.pickupCode).not.toBe(codes.deliveryCode);
    });

    it('should generate codes with valid format', async () => {
      const codes = await AuthCodeService.generateDeliveryCodes();

      expect(AuthCodeService.validateCodeFormat(codes.pickupCode)).toBe(true);
      expect(AuthCodeService.validateCodeFormat(codes.deliveryCode)).toBe(true);
    });
  });

  describe('validateCodeFormat', () => {
    it('should validate correct code format', () => {
      const validCodes = [
        'ABC-DEF-GHJ',
        'A2B-3C4-D5E',
        '234-567-89A'
      ];

      validCodes.forEach(code => {
        expect(AuthCodeService.validateCodeFormat(code)).toBe(true);
      });
    });

    it('should reject invalid code formats', () => {
      const invalidCodes = [
        'ABC-DEF',           // Too short
        'ABC-DEF-GHJ-KLM',  // Too many segments
        'ABCDEFGHJ',        // No dashes
        'AB-DEF-GHJ',       // First segment too short
        'ABC-DE-GHJ',       // Second segment too short
        'ABC-DEF-GH',       // Third segment too short
        'ABC-DEF-GH1',      // Contains confusing character (1)
        'ABC-DEF-GHO',      // Contains confusing character (O)
      ];

      invalidCodes.forEach(code => {
        expect(AuthCodeService.validateCodeFormat(code)).toBe(false);
      });
    });

    it('should reject codes with wrong length', () => {
      expect(AuthCodeService.validateCodeFormat('ABC')).toBe(false);
      expect(AuthCodeService.validateCodeFormat('ABC-DEF-GHJK')).toBe(false);
    });

    it('should reject codes with invalid characters', () => {
      expect(AuthCodeService.validateCodeFormat('ABC-DEF-GH0')).toBe(false); // Contains 0
      expect(AuthCodeService.validateCodeFormat('ABC-DEF-GHI')).toBe(false); // Contains I
      expect(AuthCodeService.validateCodeFormat('ABC-DEF-GH1')).toBe(false); // Contains 1
      expect(AuthCodeService.validateCodeFormat('ABC-DEF-GHO')).toBe(false); // Contains O
    });
  });

  describe('Code format specifications', () => {
    it('should use only non-confusing characters', async () => {
      const code = await AuthCodeService.generateUniqueCode('pickup');
      const confusingChars = ['0', 'O', '1', 'I'];
      
      confusingChars.forEach(char => {
        expect(code).not.toContain(char);
      });
    });

    it('should generate codes with exactly 3 segments', async () => {
      const code = await AuthCodeService.generateUniqueCode('delivery');
      const segments = code.split('-');
      
      expect(segments.length).toBe(3);
      expect(segments[0].length).toBe(3);
      expect(segments[1].length).toBe(3);
      expect(segments[2].length).toBe(3);
    });

    it('should generate alphanumeric codes', async () => {
      const code = await AuthCodeService.generateUniqueCode('pickup');
      const alphanumericRegex = /^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]{3}$/;
      
      expect(code).toMatch(alphanumericRegex);
    });
  });
});
