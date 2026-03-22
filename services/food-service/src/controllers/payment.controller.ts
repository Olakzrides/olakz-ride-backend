import { Request, Response } from 'express';
import { FoodPaymentService } from '../services/payment.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class PaymentController {
  /**
   * POST /api/food/payment/process
   * Body: { order_id, payment_method, payment_details? }
   */
  processPayment = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { order_id, payment_method, payment_details } = req.body;

      if (!order_id) return ResponseUtil.badRequest(res, 'order_id is required');
      if (!payment_method) return ResponseUtil.badRequest(res, 'payment_method is required');
      if (!['wallet', 'card'].includes(payment_method)) {
        return ResponseUtil.badRequest(res, 'payment_method must be wallet or card');
      }
      if (payment_method === 'card' && !payment_details) {
        return ResponseUtil.badRequest(res, 'payment_details are required for card payment');
      }

      const result = await FoodPaymentService.processPayment({
        orderId: order_id,
        customerId,
        paymentMethod: payment_method,
        paymentDetails: payment_details,
      });

      const statusCode = result.status === 'pending_authorization' ? 202 : 200;
      return res.status(statusCode).json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Unauthorized') return ResponseUtil.forbidden(res, err.message);
      if (
        err.message?.includes('already paid') ||
        err.message?.includes('cancelled') ||
        err.message?.includes('Insufficient')
      ) {
        return ResponseUtil.badRequest(res, err.message);
      }
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/payment/validate-otp
   * Body: { order_id, flw_ref, otp }
   */
  validateOtp = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { order_id, flw_ref, otp } = req.body;

      if (!order_id) return ResponseUtil.badRequest(res, 'order_id is required');
      if (!flw_ref) return ResponseUtil.badRequest(res, 'flw_ref is required');
      if (!otp) return ResponseUtil.badRequest(res, 'otp is required');

      const result = await FoodPaymentService.validateOtp({
        orderId: order_id,
        customerId,
        flwRef: flw_ref,
        otp,
      });

      return ResponseUtil.success(res, result, 'Payment completed successfully');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Unauthorized') return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('already paid')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/payment/refund
   * Body: { order_id, refund_reason }
   */
  refundOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const requesterId = (req as AuthRequest).user!.id;
      const { order_id, refund_reason } = req.body;

      if (!order_id) return ResponseUtil.badRequest(res, 'order_id is required');
      if (!refund_reason) return ResponseUtil.badRequest(res, 'refund_reason is required');

      const result = await FoodPaymentService.refundOrder({
        orderId: order_id,
        requesterId,
        refundReason: refund_reason,
      });

      return ResponseUtil.success(res, result, 'Refund processed successfully');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (
        err.message?.includes('not in a paid state') ||
        err.message?.includes('already been refunded') ||
        err.message?.includes('No Flutterwave')
      ) {
        return ResponseUtil.badRequest(res, err.message);
      }
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
