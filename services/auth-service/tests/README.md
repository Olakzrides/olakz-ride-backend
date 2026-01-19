# Auth Service Tests

Comprehensive test suite for the authentication service.

## Setup

### 1. Configure Test Environment

Copy your DATABASE_URL from `.env` to `.env.test`:

```bash
# In .env.test, replace [YOUR-PASSWORD] with your actual password
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.ijlrjelstivyhttufraq.supabase.co:5432/postgres
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.service.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="register"
```

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── teardown.ts                 # Global test cleanup
├── helpers/
│   ├── test-db.ts             # Database helpers
│   ├── test-factories.ts      # Test data factories
│   └── test-utils.ts          # Utility functions
├── unit/
│   └── services/
│       ├── auth.service.test.ts
│       ├── token.service.test.ts
│       ├── otp.service.test.ts
│       └── ...
└── integration/
    ├── auth-flow.test.ts
    └── ...
```

## Test Helpers

### Test Factories

Create test data easily:

```typescript
import { createTestUser, createVerifiedTestUser } from '../helpers/test-factories';

// Create unverified user
const user = await createTestUser();

// Create verified user
const verifiedUser = await createVerifiedTestUser();

// Create user with custom data
const customUser = await createTestUser({
  email: 'custom@test.com',
  role: 'admin',
});
```

### Test Utilities

```typescript
import { randomEmail, validPassword, expectError } from '../helpers/test-utils';

// Generate random test email
const email = randomEmail();

// Get valid password
const password = validPassword();

// Assert error is thrown
await expectError(async () => {
  await someFunction();
}, 'Expected error message');
```

### Database Cleanup

```typescript
import { cleanupTestData, deleteTestUser } from '../helpers/test-db';

// Clean up all test data
await cleanupTestData();

// Delete specific user
await deleteTestUser('test@example.com');
```

## Test Coverage

Target: **70%+ coverage** for all services

View coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

## Writing Tests

### Unit Test Example

```typescript
describe('ServiceName', () => {
  beforeEach(async () => {
    // Setup before each test
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('methodName', () => {
    it('should do something successfully', async () => {
      // Arrange
      const input = 'test';

      // Act
      const result = await service.method(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should throw error when invalid', async () => {
      await expect(service.method('invalid')).rejects.toThrow('Error message');
    });
  });
});
```

## Important Notes

### Test Data Cleanup

- Tests automatically clean up data with `test` in email
- Always use `randomEmail()` or `generateTestEmail()` for test users
- Run `cleanupTestData()` in `afterEach` hooks

### Mocked Services

The following services are mocked in tests:
- **Email Service**: No real emails sent during tests
- **External APIs**: Mocked to avoid external dependencies

### Test Database

- Uses same database as development
- Test data is automatically cleaned up
- All test emails contain "test" for easy identification

### Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Descriptive**: Use clear test names
4. **Arrange-Act-Assert**: Follow AAA pattern
5. **Fast**: Keep tests fast (< 5 seconds each)

## Troubleshooting

### Tests Failing

1. **Database connection error**:
   - Check `.env.test` has correct DATABASE_URL
   - Ensure database is accessible

2. **Prisma client error**:
   ```bash
   npm run prisma:generate
   ```

3. **Timeout errors**:
   - Increase timeout in jest.config.js
   - Check database performance

### Clean Up Test Data Manually

```bash
# Connect to your database and run:
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test%');
DELETE FROM otp_verifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test%');
DELETE FROM login_attempts WHERE email LIKE '%test%';
DELETE FROM otp_resend_tracking WHERE email LIKE '%test%';
DELETE FROM users WHERE email LIKE '%test%';
```

## CI/CD Integration

Tests run automatically in CI/CD pipeline:
- On every pull request
- Before deployment
- Coverage reports generated

## Next Steps

1. ✅ Auth service tests (current)
2. ⏳ Token service tests
3. ⏳ OTP service tests
4. ⏳ Integration tests
5. ⏳ Gateway tests
