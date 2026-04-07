import { prisma } from '../config/database';

export class AddressService {
  static async list(userId: string) {
    return prisma.marketplaceSavedAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async create(userId: string, data: { label: string; address: string; city?: string; state?: string; latitude?: number; longitude?: number; is_default?: boolean }) {
    if (data.is_default) {
      await prisma.marketplaceSavedAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return prisma.marketplaceSavedAddress.create({
      data: { userId, label: data.label, address: data.address, city: data.city || null, state: data.state || null, latitude: data.latitude || null, longitude: data.longitude || null, isDefault: data.is_default || false },
    });
  }

  static async update(userId: string, addressId: string, data: any) {
    const addr = await prisma.marketplaceSavedAddress.findFirst({ where: { id: addressId, userId } });
    if (!addr) throw new Error('Address not found');
    if (data.is_default) {
      await prisma.marketplaceSavedAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return prisma.marketplaceSavedAddress.update({
      where: { id: addressId },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.is_default !== undefined && { isDefault: data.is_default }),
      },
    });
  }

  static async delete(userId: string, addressId: string) {
    const addr = await prisma.marketplaceSavedAddress.findFirst({ where: { id: addressId, userId } });
    if (!addr) throw new Error('Address not found');
    await prisma.marketplaceSavedAddress.delete({ where: { id: addressId } });
  }
}
