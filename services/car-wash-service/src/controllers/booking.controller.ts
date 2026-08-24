import { Request, Response } from 'express';
import { BookingService } from '../services/booking.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { StorageUtil } from '../utils/storage.util';
import {
  createBookingSchema,
  cancelBookingSchema,
  rateBookingSchema,
} from '../validators/booking.validator';
import { logger } from '../config/logger';

export class BookingController {
  private bookingService = new BookingService();

  // ── Customer endpoints ─────────────────────────────────────

  /**
   * POST /api/auto-wash/bookings
   */
  createBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = createBookingSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const booking = await this.bookingService.createBooking(user.id, value);
      return ResponseUtil.created(res, booking, 'Booking created successfully');
    } catch (err: any) {
      logger.error('Create booking error:', err);
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      if (err.message.includes('not available') || err.message.includes('no longer available'))
        return ResponseUtil.conflict(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-wash/bookings
   * Customer's booking history.
   */
  getMyBookings = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);

    try {
      const result = await this.bookingService.getCustomerBookings(user.id, page, limit);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-wash/bookings/:bookingId
   */
  getBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const booking = await this.bookingService.getBookingById(req.params.bookingId, user.id);
      return ResponseUtil.success(res, booking);
    } catch (err: any) {
      if (err.message === 'Booking not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/bookings/:bookingId/photos
   * Attach vehicle photos to a pending booking.
   */
  attachPhotos = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return ResponseUtil.badRequest(res, 'No photos provided');
    }

    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const { url } = await StorageUtil.uploadFile(
          file,
          `bookings/${req.params.bookingId}/photos`
        );
        uploadedUrls.push(url);
      }

      const booking = await this.bookingService.attachVehiclePhotos(
        req.params.bookingId,
        user.id,
        uploadedUrls
      );
      return ResponseUtil.success(res, booking, 'Photos attached');
    } catch (err: any) {
      logger.error('Attach booking photos error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/bookings/:bookingId/cancel
   */
  cancelBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = cancelBookingSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const booking = await this.bookingService.cancelBookingByCustomer(
        req.params.bookingId,
        user.id,
        value.cancellationReason
      );
      return ResponseUtil.success(res, booking, 'Booking cancelled');
    } catch (err: any) {
      if (err.message === 'Booking not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      return ResponseUtil.badRequest(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/bookings/:bookingId/rate
   */
  rateBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = rateBookingSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const booking = await this.bookingService.rateBooking(
        req.params.bookingId,
        user.id,
        value.rating,
        value.feedback
      );
      return ResponseUtil.success(res, booking, 'Thank you for your rating!');
    } catch (err: any) {
      if (err.message === 'Booking not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      return ResponseUtil.badRequest(res, err.message);
    }
  };

  // ── Vendor endpoints ────────────────────────────────────────

  /**
   * POST /api/car-wash/bookings/vendor/:bookingId/decline
   * Vendor declines/rejects a pending or confirmed booking with a reason.
   */
  declineBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { reason } = req.body;
    if (!reason) return ResponseUtil.badRequest(res, 'reason is required');

    try {
      const booking = await this.bookingService.declineBooking(req.params.bookingId, user.id, reason);
      return ResponseUtil.success(res, booking, 'Booking declined');
    } catch (err: any) {
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      if (err.message === 'Booking not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.badRequest(res, err.message);
    }
  };

  /**
   * GET /api/car-wash/bookings/vendor/all
   * Vendor sees their own incoming bookings.
   */
  getVendorBookings = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const status = req.query.status as string | undefined;

    try {
      const { data: myVendor } = await (await import('../config/database')).supabase
        .from('car_wash_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const result = await this.bookingService.getVendorBookings(myVendor.id, user.id, page, limit, status);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/vendor/bookings/:bookingId/confirm
   */
  confirmBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const booking = await this.bookingService.confirmBooking(req.params.bookingId, user.id);
      return ResponseUtil.success(res, booking, 'Booking confirmed');
    } catch (err: any) {
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      return ResponseUtil.badRequest(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/vendor/bookings/:bookingId/start
   */
  startBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const booking = await this.bookingService.startBooking(req.params.bookingId, user.id);
      return ResponseUtil.success(res, booking, 'Wash service started');
    } catch (err: any) {
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      return ResponseUtil.badRequest(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/vendor/bookings/:bookingId/complete
   */
  completeBooking = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const booking = await this.bookingService.completeBooking(req.params.bookingId, user.id);
      return ResponseUtil.success(res, booking, 'Wash service completed');
    } catch (err: any) {
      if (err.message === 'Unauthorised') return ResponseUtil.forbidden(res);
      return ResponseUtil.badRequest(res, err.message);
    }
  };
}
