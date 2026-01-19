import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class TokenService {
  /**
   * Generate access and refresh tokens
   */
  async generateTokens(userId: string, email: string, role: string): Promise<TokenPair> {
    const payload: TokenPayload = { userId, email, role };

    // Generate access token (short-lived)
    const accessToken = jwt.sign(payload, config.jwt.secret as string, {
      expiresIn: config.jwt.accessTokenExpiry,
    } as jwt.SignOptions);

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign({ userId }, config.jwt.secret as string, {
      expiresIn: config.jwt.refreshTokenExpiry,
    } as jwt.SignOptions);

    // Store refresh token in database
    await this.storeRefreshToken(userId, refreshToken);

    return { accessToken, refreshToken };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret as string) as TokenPayload;
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Access token expired');
      }
      throw new UnauthorizedError('Invalid access token');
    }
  }

  /**
   * Verify refresh token and generate new tokens
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.secret as string) as { userId: string };

      // Check if token exists in database and not revoked
      const tokenHash = this.hashToken(refreshToken);
      const { data: storedToken, error } = await supabase
        .from('refresh_tokens')
        .select('*')
        .eq('token', tokenHash)
        .eq('user_id', decoded.userId)
        .eq('revoked', false)
        .single();

      if (error || !storedToken) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Check if token expired
      if (new Date(storedToken.expires_at) < new Date()) {
        await this.revokeRefreshToken(refreshToken);
        throw new UnauthorizedError('Refresh token expired');
      }

      // Get user data
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', decoded.userId)
        .single();

      if (userError || !user) {
        throw new UnauthorizedError('User not found');
      }

      // Revoke old refresh token
      await this.revokeRefreshToken(refreshToken);

      // Generate new token pair
      return await this.generateTokens(user.id, user.email, user.role);
    } catch (error: any) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Refresh token expired');
      }
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const { error } = await supabase.from('refresh_tokens').insert({
      user_id: userId,
      token: tokenHash,
      expires_at: expiresAt.toISOString(),
      revoked: false,
    });

    if (error) {
      logger.error('Error storing refresh token:', error);
      throw new Error('Failed to store refresh token');
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    const { error } = await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('token', tokenHash);

    if (error) {
      logger.error('Error revoking refresh token:', error);
    }
  }

  /**
   * Revoke all user tokens (logout from all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const { error } = await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('user_id', userId);

    if (error) {
      logger.error('Error revoking all user tokens:', error);
      throw new Error('Failed to revoke tokens');
    }
  }

  /**
   * Hash token for storage (don't store plain tokens)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Cleanup expired tokens (call periodically)
   */
  async cleanupExpiredTokens(): Promise<void> {
    const { error } = await supabase
      .from('refresh_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      logger.error('Error cleaning up expired tokens:', error);
    } else {
      logger.info('Cleaned up expired refresh tokens');
    }
  }
}

export default new TokenService();