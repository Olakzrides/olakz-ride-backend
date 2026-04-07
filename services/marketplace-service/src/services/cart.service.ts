import { prisma } from '../config/database';

export class CartService {
  static async getCart(userId: string) {
    const cart = await prisma.marketplaceCart.findFirst({
      where: { userId },
      include: {
        store: { select: { id: true, name: true, logoUrl: true } },
        items: {
          include: { product: { select: { id: true, name: true, price: true, images: true, isAvailable: true } } },
        },
      },
    });
    if (!cart) return null;

    const subtotal = cart.items.reduce((sum, item) => sum + parseFloat(item.unitPrice.toString()) * item.quantity, 0);
    return { ...cart, subtotal };
  }

  static async addItem(userId: string, productId: string, quantity: number) {
    const product = await prisma.marketplaceProduct.findUnique({
      where: { id: productId },
      include: { store: true },
    });
    if (!product) throw new Error('Product not found');
    if (!product.isActive || !product.isAvailable) throw new Error(`Product "${product.name}" is not available`);

    // Check if customer has a cart from a different store — clear it
    const existingCart = await prisma.marketplaceCart.findFirst({ where: { userId } });
    let cartCleared = false;
    let previousStoreName: string | undefined;

    if (existingCart && existingCart.storeId !== product.storeId) {
      previousStoreName = (await prisma.marketplaceStore.findUnique({ where: { id: existingCart.storeId }, select: { name: true } }))?.name;
      await prisma.marketplaceCartItem.deleteMany({ where: { cartId: existingCart.id } });
      await prisma.marketplaceCart.delete({ where: { id: existingCart.id } });
      cartCleared = true;
    }

    // Upsert cart
    const cart = await prisma.marketplaceCart.upsert({
      where: { userId_storeId: { userId, storeId: product.storeId } },
      create: { userId, storeId: product.storeId },
      update: { updatedAt: new Date() },
    });

    // Check if item already in cart
    const existing = await prisma.marketplaceCartItem.findFirst({
      where: { cartId: cart.id, productId },
    });

    let cartItem;
    if (existing) {
      cartItem = await prisma.marketplaceCartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity, updatedAt: new Date() },
      });
    } else {
      cartItem = await prisma.marketplaceCartItem.create({
        data: { cartId: cart.id, productId, quantity, unitPrice: product.price },
      });
    }

    return { cartItem, cart_cleared: cartCleared, previous_store: previousStoreName };
  }

  static async updateItem(userId: string, cartItemId: string, quantity: number) {
    const cart = await prisma.marketplaceCart.findFirst({ where: { userId } });
    if (!cart) throw new Error('Cart not found');

    const item = await prisma.marketplaceCartItem.findFirst({ where: { id: cartItemId, cartId: cart.id } });
    if (!item) throw new Error('Cart item not found');

    if (quantity <= 0) {
      await prisma.marketplaceCartItem.delete({ where: { id: cartItemId } });
      return null;
    }

    return prisma.marketplaceCartItem.update({ where: { id: cartItemId }, data: { quantity, updatedAt: new Date() } });
  }

  static async removeItem(userId: string, cartItemId: string) {
    const cart = await prisma.marketplaceCart.findFirst({ where: { userId } });
    if (!cart) throw new Error('Cart not found');
    await prisma.marketplaceCartItem.deleteMany({ where: { id: cartItemId, cartId: cart.id } });
  }

  static async clearCart(userId: string) {
    const cart = await prisma.marketplaceCart.findFirst({ where: { userId } });
    if (!cart) return;
    await prisma.marketplaceCartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.marketplaceCart.delete({ where: { id: cart.id } });
  }
}
