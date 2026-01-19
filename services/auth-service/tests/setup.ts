import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock email service to prevent sending real emails during tests
jest.mock('../src/services/email.service', () => ({
  sendOTPEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

// Global test setup
beforeAll(async () => {
  console.log('🧪 Test suite starting...');
});

afterAll(async () => {
  console.log('✅ Test suite completed');
});
