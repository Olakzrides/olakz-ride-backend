# Apple Sign-In Implementation Guide

## Overview
This guide explains how to use the Apple Sign-In functionality in the Olakz Ride authentication service.

## API Endpoints

### 1. Apple Sign-In (Primary Method)
**Endpoint:** `POST /api/auth/apple/signin`

**Description:** Handle Apple Sign-In authorization code from frontend

**Request Body:**
```json
{
  "authorization_code": "c1234567890abcdef...",
  "user_info": {
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john.doe@example.com"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Apple authentication successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "john.doe@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "username": "john_abc123",
      "role": "customer",
      "avatarUrl": null,
      "emailVerified": true
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

### 2. Apple OAuth Callback (Web Flow)
**Endpoint:** `GET /api/auth/apple/callback`

**Description:** Handle Apple OAuth callback for web-based flow

**Query Parameters:**
- `code`: Authorization code from Apple
- `state`: Optional state parameter

**Response:** Redirects to frontend with tokens

## Frontend Integration

### Mobile App (React Native)
```javascript
import { appleAuth } from '@invertase/react-native-apple-authentication';

const handleAppleSignIn = async () => {
  try {
    // Request Apple authentication
    const appleAuthRequestResponse = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });

    // Get credential state
    const credentialState = await appleAuth.getCredentialStateForUser(
      appleAuthRequestResponse.user
    );

    if (credentialState === appleAuth.State.AUTHORIZED) {
      // Send to backend
      const response = await fetch('/api/auth/apple/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authorization_code: appleAuthRequestResponse.authorizationCode,
          user_info: {
            name: {
              firstName: appleAuthRequestResponse.fullName?.givenName,
              lastName: appleAuthRequestResponse.fullName?.familyName,
            },
            email: appleAuthRequestResponse.email,
          },
        }),
      });

      const result = await response.json();
      // Handle successful authentication
      console.log('Apple Sign-In successful:', result);
    }
  } catch (error) {
    console.error('Apple Sign-In error:', error);
  }
};
```

### Web App (JavaScript)
```javascript
// Configure Apple Sign-In
window.AppleID.auth.init({
  clientId: 'com.olakzride.service',
  scope: 'name email',
  redirectURI: 'https://olakzride.duckdns.org/api/auth/apple/callback',
  state: 'optional_state_parameter',
  usePopup: true
});

// Handle Apple Sign-In
const handleAppleSignIn = async () => {
  try {
    const data = await window.AppleID.auth.signIn();
    
    // Send authorization code to backend
    const response = await fetch('/api/auth/apple/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authorization_code: data.authorization.code,
        user_info: {
          name: {
            firstName: data.user?.name?.firstName,
            lastName: data.user?.name?.lastName,
          },
          email: data.user?.email,
        },
      }),
    });

    const result = await response.json();
    // Handle successful authentication
    console.log('Apple Sign-In successful:', result);
  } catch (error) {
    console.error('Apple Sign-In error:', error);
  }
};
```

## Configuration

### Environment Variables
```bash
# Apple Sign-In Configuration
APPLE_TEAM_ID=TEAM-ID
APPLE_KEY_ID=KEY-ID
APPLE_SERVICE_ID=SERVICE
APPLE_BUNDLE_ID=BUDLE-ID
APPLE_REDIRECT_URI=https://olakzride.duckdns.org/api/auth/apple/callback
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

### Apple Developer Setup
1. **Create Service ID:**
   - Go to Apple Developer Console
   - Create a new Service ID: `com.olakzride.service`
   - Configure Sign in with Apple
   - Add return URLs: `https://olakzride.duckdns.org/api/auth/apple/callback`

2. **Create Private Key:**
   - Generate a new key with Sign in with Apple capability
   - Download the .p8 file
   - Note the Key ID (W9477G3VC9)

3. **Configure App ID:**
   - Ensure your app ID (`com.olakz.olakzride`) has Sign in with Apple enabled

## Testing

### Without iOS Device
You can test Apple Sign-In using:

1. **Web-based Testing:**
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <script type="text/javascript" src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
   </head>
   <body>
     <div id="appleid-signin" data-color="black" data-border="true" data-type="sign in"></div>
     <script>
       AppleID.auth.init({
         clientId: 'com.olakzride.service',
         scope: 'name email',
         redirectURI: 'https://olakzride.duckdns.org/api/auth/apple/callback',
         usePopup: true
       });
     </script>
   </body>
   </html>
   ```

2. **Postman Testing:**
   ```bash
   POST https://olakzride.duckdns.org/api/auth/apple/signin
   Content-Type: application/json

   {
     "authorization_code": "mock_code_for_testing",
     "user_info": {
       "name": {
         "firstName": "Test",
         "lastName": "User"
       },
       "email": "test@example.com"
     }
   }
   ```

### Unit Tests
Run the Apple Sign-In tests:
```bash
cd services/auth-service
npm test -- apple.service.test.ts
```

## Security Considerations

1. **Private Key Security:**
   - Store the Apple private key securely in environment variables
   - Never commit the .p8 file to version control
   - Use proper key rotation practices

2. **Token Validation:**
   - Always verify Apple ID tokens with Apple's public keys
   - Check token expiration and audience
   - Validate the issuer is Apple

3. **User Privacy:**
   - Apple users can choose to hide their email
   - Handle cases where email is not provided
   - Respect Apple's privacy guidelines

## Troubleshooting

### Common Issues

1. **Invalid Client Secret:**
   - Check that APPLE_PRIVATE_KEY is properly formatted
   - Ensure Key ID matches the downloaded key
   - Verify Team ID is correct

2. **Token Verification Failed:**
   - Check that Service ID matches the audience in the token
   - Ensure Apple's public keys are being fetched correctly
   - Verify token hasn't expired

3. **User Creation Failed:**
   - Handle cases where email is not provided
   - Ensure username generation doesn't conflict
   - Check database constraints

### Debug Logging
Enable debug logging to troubleshoot issues:
```bash
LOG_LEVEL=debug
```

## Production Deployment

1. **Environment Variables:**
   - Set all Apple Sign-In environment variables
   - Use secure key storage (AWS Secrets Manager, etc.)

2. **HTTPS Required:**
   - Apple Sign-In requires HTTPS in production
   - Ensure SSL certificates are valid

3. **Domain Verification:**
   - Verify your domain with Apple
   - Update return URLs in Apple Developer Console

## Support

For issues with Apple Sign-In implementation:
1. Check Apple Developer Documentation
2. Review server logs for detailed error messages
3. Test with Apple's web-based Sign in with Apple first
4. Verify all configuration values are correct