import { Request, Response } from 'express';
import { DriverService } from '../services/driver.service';
import { ResponseUtil } from '../utils/response.util';

export class DriverController {
  private driverService: DriverService;

  constructor() {
    this.driverService = new DriverService();
  }

  /**
   * Register as a driver
   * POST /api/drivers/register
   */
  registerDriver = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const { identificationType, identificationNumber, licenseNumber, vehicleTypeId, vehicle } = req.body;

      // Validation
      if (!identificationType || !identificationNumber || !vehicleTypeId || !vehicle) {
        ResponseUtil.badRequest(res, 'Missing required fields: identificationType, identificationNumber, vehicleTypeId, vehicle');
        return;
      }

      // Validate identification type
      const validIdTypes = ['drivers_license', 'national_id', 'passport'];
      if (!validIdTypes.includes(identificationType)) {
        ResponseUtil.badRequest(res, `Invalid identification type. Must be one of: ${validIdTypes.join(', ')}`);
        return;
      }

      // Validate vehicle fields
      if (!vehicle.plateNumber || !vehicle.manufacturer || !vehicle.model || !vehicle.year || !vehicle.color) {
        ResponseUtil.badRequest(res, 'Missing required vehicle fields');
        return;
      }

      // Check if license number is required based on vehicle type
      // For now, we'll accept it as optional and let admin verify during approval
      // In production, you'd fetch vehicle type and check if it requires a license

      const result = await this.driverService.registerDriver(userId, {
        identificationType,
        identificationNumber,
        licenseNumber,
        vehicleTypeId,
        vehicle,
      });

      ResponseUtil.created(res, result, 'Driver registration successful. Driver role added automatically. Awaiting admin approval.');
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Get driver profile
   * GET /api/drivers/profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const driver = await this.driverService.getDriverProfile(userId);

      if (!driver) {
        ResponseUtil.notFound(res, 'Driver profile not found');
        return;
      }

      ResponseUtil.success(res, { driver });
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Update driver profile
   * PUT /api/drivers/profile
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const { identificationType, identificationNumber, licenseNumber, vehicleTypeId } = req.body;

      const driver = await this.driverService.updateDriverProfile(userId, {
        identificationType,
        identificationNumber,
        licenseNumber,
        vehicleTypeId,
      });

      ResponseUtil.success(res, { driver }, 'Profile updated successfully');
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Add or update driver vehicle
   * POST /api/drivers/vehicle
   */
  upsertVehicle = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const { vehicleTypeId, plateNumber, manufacturer, model, year, color } = req.body;

      // Validation
      if (!vehicleTypeId || !plateNumber || !manufacturer || !model || !year || !color) {
        ResponseUtil.badRequest(res, 'Missing required vehicle fields');
        return;
      }

      const vehicle = await this.driverService.upsertDriverVehicle(userId, {
        vehicleTypeId,
        plateNumber,
        manufacturer,
        model,
        year: parseInt(year),
        color,
      });

      ResponseUtil.success(res, { vehicle }, 'Vehicle updated successfully');
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Upload driver document
   * POST /api/drivers/documents
   */
  uploadDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const file = req.file;
      if (!file) {
        ResponseUtil.badRequest(res, 'No file uploaded');
        return;
      }

      const { documentType, expiryDate } = req.body;

      if (!documentType) {
        ResponseUtil.badRequest(res, 'Document type is required');
        return;
      }

      const validDocumentTypes = ['license', 'insurance', 'vehicle_registration', 'profile_photo', 'vehicle_photo'];
      if (!validDocumentTypes.includes(documentType)) {
        ResponseUtil.badRequest(res, `Invalid document type. Must be one of: ${validDocumentTypes.join(', ')}`);
        return;
      }

      const document = await this.driverService.uploadDocument(
        userId,
        file,
        documentType,
        expiryDate ? new Date(expiryDate) : undefined
      );

      ResponseUtil.created(res, { document }, 'Document uploaded successfully. Awaiting verification.');
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Update driver online/offline status
   * PUT /api/drivers/status
   */
  updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const { isOnline, isAvailable } = req.body;

      if (typeof isOnline !== 'boolean') {
        ResponseUtil.badRequest(res, 'isOnline must be a boolean');
        return;
      }

      const availability = await this.driverService.updateDriverStatus(userId, {
        isOnline,
        isAvailable,
      });

      ResponseUtil.success(res, { availability }, 'Status updated successfully');
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Update driver location
   * POST /api/drivers/location
   */
  updateLocation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      const { latitude, longitude, heading, speed, accuracy } = req.body;

      // Validation
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        ResponseUtil.badRequest(res, 'Valid latitude and longitude are required');
        return;
      }

      if (latitude < -90 || latitude > 90) {
        ResponseUtil.badRequest(res, 'Latitude must be between -90 and 90');
        return;
      }

      if (longitude < -180 || longitude > 180) {
        ResponseUtil.badRequest(res, 'Longitude must be between -180 and 180');
        return;
      }

      const location = await this.driverService.updateDriverLocation(userId, {
        latitude,
        longitude,
        heading,
        speed,
        accuracy,
      });

      ResponseUtil.success(res, { location }, 'Location updated successfully');
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Get driver's current location
   * GET /api/drivers/:driverId/location
   */
  getDriverLocation = async (req: Request, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;

      const location = await this.driverService.getDriverLocation(driverId);

      if (!location) {
        ResponseUtil.notFound(res, 'Driver location not found');
        return;
      }

      ResponseUtil.success(res, { location });
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Find nearby available drivers
   * POST /api/drivers/nearby
   */
  findNearbyDrivers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { latitude, longitude, radiusKm, vehicleTypeId, limit } = req.body;

      // Validation
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        ResponseUtil.badRequest(res, 'Valid latitude and longitude are required');
        return;
      }

      const drivers = await this.driverService.findNearbyDrivers({
        latitude,
        longitude,
        radiusKm,
        vehicleTypeId,
        limit,
      });

      ResponseUtil.success(res, {
        drivers,
        count: drivers.length,
      });
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Approve or reject driver (Admin only)
   * PUT /api/drivers/:driverId/approve
   */
  approveDriver = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminUserId = (req as any).user?.id;
      if (!adminUserId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      // Check if user is admin
      if ((req as any).user?.role !== 'admin') {
        ResponseUtil.forbidden(res, 'Only admins can approve drivers');
        return;
      }

      const { driverId } = req.params;
      const { status, rejectionReason } = req.body;

      if (!status || !['approved', 'rejected'].includes(status)) {
        ResponseUtil.badRequest(res, 'Status must be either "approved" or "rejected"');
        return;
      }

      if (status === 'rejected' && !rejectionReason) {
        ResponseUtil.badRequest(res, 'Rejection reason is required when rejecting a driver');
        return;
      }

      const driver = await this.driverService.approveDriver(
        driverId,
        { status, rejectionReason },
        adminUserId
      );

      ResponseUtil.success(res, { driver }, `Driver ${status} successfully`);
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Verify driver document (Admin only)
   * PUT /api/drivers/documents/:documentId/verify
   */
  verifyDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminUserId = (req as any).user?.id;
      if (!adminUserId) {
        ResponseUtil.unauthorized(res, 'User not authenticated');
        return;
      }

      // Check if user is admin
      if ((req as any).user?.role !== 'admin') {
        ResponseUtil.forbidden(res, 'Only admins can verify documents');
        return;
      }

      const { documentId } = req.params;
      const { status, notes } = req.body;

      if (!status || !['approved', 'rejected'].includes(status)) {
        ResponseUtil.badRequest(res, 'Status must be either "approved" or "rejected"');
        return;
      }

      const document = await this.driverService.verifyDocument(
        documentId,
        { status, notes },
        adminUserId
      );

      ResponseUtil.success(res, { document }, `Document ${status} successfully`);
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Get all drivers (Admin only)
   * GET /api/drivers
   */
  getAllDrivers = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if user is admin
      if ((req as any).user?.role !== 'admin') {
        ResponseUtil.forbidden(res, 'Only admins can view all drivers');
        return;
      }

      const { status, vehicleTypeId, page, limit } = req.query;

      const result = await this.driverService.getAllDrivers({
        status: status as string,
        vehicleTypeId: vehicleTypeId as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      ResponseUtil.success(res, {
        drivers: result.drivers,
        pagination: {
          page: page ? parseInt(page as string) : 1,
          limit: limit ? parseInt(limit as string) : 20,
          total: result.total,
          totalPages: Math.ceil(result.total / (limit ? parseInt(limit as string) : 20)),
        },
      });
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Get driver by ID (Admin only)
   * GET /api/drivers/:driverId
   */
  getDriverById = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if user is admin
      if ((req as any).user?.role !== 'admin') {
        ResponseUtil.forbidden(res, 'Only admins can view driver details');
        return;
      }

      const { driverId } = req.params;

      const driver = await this.driverService.getDriverById(driverId);

      if (!driver) {
        ResponseUtil.notFound(res, 'Driver not found');
        return;
      }

      ResponseUtil.success(res, { driver });
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };
}
