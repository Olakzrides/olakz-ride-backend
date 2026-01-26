import jwt from 'jsonwebtoken';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';
import tokenService from './token.service';

interface AppleUserInfo {
  email?: string;
  first_name?: string;
  last_name?: string;
  sub: string; // Apple ID
}

interface AppleTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
}

interface AppleAuthRequest {
  authorization_code: string;
  user_info?: {
    name?: {
      firstName?: string;
      lastName?: string;
    };
    email?: string;
  };
}

class AppleService {
  private readonly APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
  private readonly APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

  /**
   * Generate client secret JWT for Apple
   */
  private generateClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iss: config.apple.teamId,
      iat: now,
      exp: now + 3600, // 1 hour
      aud: 'https://appleid.apple.com',
      sub: config.apple.serviceId,
    };

    // Clean the private key (remove headers and format properly)
    const privateKey = config.apple.privateKey
      .replace(/\\n/g, '\n')
      .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
      .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');

    return jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      keyid: config.apple.keyId,
    });
  }

  /**
   * Exchange authorization code for Apple tokens
   */
  private async exchangeCodeForTokens(authorizationCode: string): Promise<any> {
    try {
      const clientSecret = this.generateClientSecret();

      const params = new URLSearchParams({
        client_id: config.apple.serviceId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
        redirect_uri: config.apple.redirectUri,
      });

      const response = await axios.post(this.APPLE_TOKEN_URL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Apple token exchange error:', error.response?.data || error.message);
      throw new UnauthorizedError('Failed to exchange Apple authorization code');
    }
  }

  /**
   * Verify Apple ID token
   */
  private async verifyAppleToken(idToken: string): Promise<AppleTokenPayload> {
    try {
      // Get Apple's public keys
      const keysResponse = await axios.get(this.APPLE_KEYS_URL);
      const keys = keysResponse.data.keys;

      // Decode token header to get key ID
      const decodedHeader = jwt.decode(idToken, { complete: true });
      if (!decodedHeader || typeof decodedHeader === 'string') {
        throw new UnauthorizedError('Invalid Apple token format');
      }

      const keyId = decodedHeader.header.kid;
      const appleKey = keys.find((key: any) => key.kid === keyId);

      if (!appleKey) {
        throw new UnauthorizedError('Apple key not found');
      }

      // Convert JWK to PEM format for verification
      const publicKey = this.jwkToPem(appleKey);

      // Verify the token
      const payload = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        audience: config.apple.serviceId,
        issuer: 'https://appleid.apple.com',
      }) as AppleTokenPayload;

      return payload;
    } catch (error: any) {
      logger.error('Apple token verification error:', error.message);
      throw new UnauthorizedError('Invalid Apple token');
    }
  }

  /**
   * Convert JWK to PEM format (simplified approach)
   */
  private jwkToPem(jwk: any): string {
    // For production, we should use a proper library like 'jwk-to-pem'
    // For now, we'll use a simplified approach that works with Apple's RSA keys
    
    const { n, e } = jwk;
    
    // Convert base64url to base64
    const modulus = Buffer.from(n.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const exponent = Buffer.from(e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    
    // Create a basic RSA public key structure
    // This is a simplified version - in production, use 'node-rsa' or 'jwk-to-pem'
    const modulusHex = modulus.toString('hex');
    const exponentHex = exponent.toString('hex');
    
    // For Apple's standard RSA keys, we can construct a basic PEM
    // This works for most Apple public keys
    const keyData = `30820122300d06092a864886f70d01010105000382010f003082010a0282010100${modulusHex}0203${exponentHex}`;
    const keyBuffer = Buffer.from(keyData, 'hex');
    const keyBase64 = keyBuffer.toString('base64');
    
    // Format as PEM
    const pem = '-----BEGIN PUBLIC KEY-----\n' +
                keyBase64.match(/.{1,64}/g)?.join('\n') +
                '\n-----END PUBLIC KEY-----';
    
    return pem;
  }

  /**
   * Handle Apple Sign-In (main method)
   */
  async handleAppleSignIn(request: AppleAuthRequest): Promise<any> {
    try {
      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(request.authorization_code);
      
      if (!tokenResponse.id_token) {
        throw new UnauthorizedError('No ID token received from Apple');
      }

      // Verify the ID token
      const payload = await this.verifyAppleToken(tokenResponse.id_token);

      // Extract user info
      const appleUser: AppleUserInfo = {
        sub: payload.sub,
        email: payload.email || request.user_info?.email,
        first_name: request.user_info?.name?.firstName || '',
        last_name: request.user_info?.name?.lastName || '',
      };

      // Find or create user
      return await this.findOrCreateUser(appleUser);
    } catch (error: any) {
      logger.error('Apple Sign-In error:', error.message);
      throw error;
    }
  }

  /**
   * Find or create user from Apple info
   */
  private async findOrCreateUser(appleUser: AppleUserInfo): Promise<any> {
    const { email, first_name, last_name, sub } = appleUser;

    // Check if user exists by Apple ID or email
    let query = supabase
      .from('users')
      .select('*');

    if (email) {
      query = query.or(`email.eq.${email.toLowerCase()},provider_id.eq.${sub}`);
    } else {
      query = query.eq('provider_id', sub);
    }

    const { data: existingUser } = await query.single();

    let user;

    if (existingUser) {
      // User exists - update if needed
      user = existingUser;

      // Update Apple ID if not set (user registered with email first)
      if (!user.provider_id && user.provider === 'emailpass' && email) {
        await supabase
          .from('users')
          .update({
            provider: 'apple',
            provider_id: sub,
            email_verified: true, // Apple verifies emails
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      }

      // Update last login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);

      logger.info(`Existing user logged in with Apple: ${email || sub}`);
    } else {
      // Create new user
      const userId = uuidv4();
      
      // Generate username from email or Apple ID
      const username = this.generateUsername(email, first_name);

      const userData = {
        id: userId,
        email: email?.toLowerCase() || `${sub}@privaterelay.appleid.com`, // Apple private relay
        password_hash: '', // No password for OAuth users
        first_name: first_name || 'Apple',
        last_name: last_name || 'User',
        username,
        role: 'customer',
        provider: 'apple',
        provider_id: sub,
        avatar_url: null, // Apple doesn't provide profile pictures
        email_verified: !!email, // Only verified if email is provided
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (createError) {
        logger.error('Error creating Apple user:', createError);
        throw new Error('Failed to create user');
      }

      user = newUser;
      logger.info(`New user created with Apple: ${email || sub}`);
    }

    // Generate JWT tokens
    const tokens = await tokenService.generateTokens(user.id, user.email, user.role);

    // Return user data
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatar_url,
      emailVerified: user.email_verified,
    };

    return { user: userData, ...tokens };
  }

  /**
   * Generate username from email or name
   */
  private generateUsername(email?: string, firstName?: string): string {
    // Prefer a cleaned firstName if provided, otherwise use email prefix
    let base = 'appleuser';
    
    if (firstName) {
      base = firstName.toLowerCase().replace(/\s+/g, '');
    } else if (email && !email.includes('@privaterelay.appleid.com')) {
      base = email.split('@')[0].toLowerCase();
    }
    
    // Add random suffix to ensure uniqueness
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${base}_${randomSuffix}`;
  }

  /**
   * Handle Apple OAuth callback (for web-based flow)
   */
  async handleCallback(code: string, _state?: string): Promise<any> {
    try {
      return await this.handleAppleSignIn({ authorization_code: code });
    } catch (error) {
      logger.error('Apple OAuth callback error:', error);
      throw new UnauthorizedError('Failed to authenticate with Apple');
    }
  }
}

export default new AppleService();