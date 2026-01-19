/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate random email
 */
export function randomEmail(): string {
  return `test-${randomString(8)}@test.com`;
}

/**
 * Generate valid password
 */
export function validPassword(): string {
  return 'Test@1234';
}

/**
 * Generate invalid password (too short)
 */
export function invalidPassword(): string {
  return 'Test@1';
}

/**
 * Assert error is thrown
 */
export async function expectError(fn: () => Promise<any>, errorMessage?: string) {
  try {
    await fn();
    throw new Error('Expected function to throw an error');
  } catch (error: any) {
    if (errorMessage) {
      expect(error.message).toContain(errorMessage);
    }
    return error;
  }
}

/**
 * Mock IP address
 */
export function mockIpAddress(): string {
  return '127.0.0.1';
}
