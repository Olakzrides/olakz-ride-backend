import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';
import tokenService from './token.service';

interface GoogleUserInfo {
  email: string;
  given_name: string;
  family_name: string;
  picture?: string;
  sub: string; // Google ID
}

class GoogleService {
  private client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  /**
   * Get Google OAuth URL (for server-side flow)
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  /**
   * Handle Google OAuth callback (server-side flow)
   */
  async handleCallback(code: string): Promise<any> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.client.getToken(code);
      this.client.setCredentials(tokens);

      // Get user info
      const userInfo = await this.getUserInfo(tokens.id_token!);

      // Find or create user
      return await this.findOrCreateUser(userInfo);
    } catch (error) {
      logger.error('Google OAuth callback error:', error);
      throw new UnauthorizedError('Failed to authenticate with Google');
    }
  }

  /**
   * Verify Google token (client-side flow - for mobile)
   */
  async verifyGoogleToken(idToken: string): Promise<any> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: config.google.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedError('Invalid Google token');
      }

      const userInfo: GoogleUserInfo = {
        email: payload.email!,
        given_name: payload.given_name || '',
        family_name: payload.family_name || '',
        picture: payload.picture,
        sub: payload.sub,
      };

      return await this.findOrCreateUser(userInfo);
    } catch (error) {
      logger.error('Google token verification error:', error);
      throw new UnauthorizedError('Invalid Google token');
    }
  }

  /**
   * Get user info from Google token
   */
  private async getUserInfo(idToken: string): Promise<GoogleUserInfo> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedError('Invalid Google token');
    }

    return {
      email: payload.email!,
      given_name: payload.given_name || '',
      family_name: payload.family_name || '',
      picture: payload.picture,
      sub: payload.sub,
    };
  }

  /**
   * Find or create user from Google info
   */
  private async findOrCreateUser(googleUser: GoogleUserInfo): Promise<any> {
    const { email, given_name, family_name, picture, sub } = googleUser;

    // Check if user exists by email or Google ID
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${email.toLowerCase()},provider_id.eq.${sub}`)
      .single();

    let user;

    if (existingUser) {
      // User exists - update if needed
      user = existingUser;

      // Update Google ID if not set (user registered with email first)
      if (!user.provider_id && user.provider === 'emailpass') {
        await supabase
          .from('users')
          .update({
            provider: 'google',
            provider_id: sub,
            avatar_url: picture,
            email_verified: true, // Google verifies emails
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      }

      // Update last login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);

      logger.info(`Existing user logged in with Google: ${email}`);
    } else {
      // Create new user
      const userId = uuidv4();
      
      // Generate username from email or name
      const username = this.generateUsername(email, given_name);

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: email.toLowerCase(),
          password_hash: '', // No password for OAuth users
          first_name: given_name,
          last_name: family_name,
          username,
          role: 'customer',
          provider: 'google',
          provider_id: sub,
          avatar_url: picture,
          email_verified: true, // Google verifies emails
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        logger.error('Error creating Google user:', createError);
        throw new Error('Failed to create user');
      }

      user = newUser;
      logger.info(`New user created with Google: ${email}`);
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
  private generateUsername(email: string, firstName?: string): string {
    // Prefer a cleaned firstName if provided, otherwise use email prefix
    const base = firstName ? firstName.toLowerCase().replace(/\s+/g, '') : email.split('@')[0].toLowerCase();
    // Add random suffix to ensure uniqueness
    const randomSuffix = Math.random().toString(36).substring(2, 6);

    return `${base}_${randomSuffix}`;
  }
}

export default new GoogleService();