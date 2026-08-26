import { prisma } from '../config/database';

export class CartService {
  // ─────────────────────────────────────────────────────────────────
  // GET CART
  // ─────────────────────────────────────────────────────────────────

  static async getCart(userId: string) {
    const cart = await prisma.sparePartsCart.findFirst({
      where: { userId },
      include: {
        store: { select: { id: true, name: true, logoUrl: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
                isAvailable: true,
                specs: true,
              },
            },
          },
        },
      },
    });

    if (!cart) return null;

    const subtotal = cart.items.reduce(
      (sum: number, item: { unitPrice: any; quantity: number }) =>
        sum + parseFloat(item.unitPrice.toString()) * item.quantity,
      0
    );

    return { ...cart, subtotal };
  }

  // ─────────────────────────────────────────────────────────────────
  // ADD ITEM
  // One-store-per-cart rule: adding from a different store clears
  // the existing cart after warning the customer.
  // ─────────────────────────────────────────────────────────────────

  static async addItem(userId: string, productId: string, quantity: number) {
    if (quantity <= 0) throw new Error('Quantity must be at least 1');

    const product = await prisma.sparePartsProduct.findUnique({
      where: { id: productId },
      include: { store: true },
    });
    if (!product) throw new Error('Product not found');
    if (!product.isActive || !product.isAvailable) {
      throw new Error(`Product "${product.name}" is not available`);
    }

    // Check if customer has a cart from a different store — clear it
    const existingCart = await prisma.sparePartsCart.findFirst({ where: { userId } });
    let cartCleared       = false;
    let previousStoreName: string | undefined;

    if (existingCart && existingCart.storeId !== product.storeId) {
      const prev = await prisma.sparePartsStore.findUnique({
        where: { id: existingCart.storeId },
        select: { name: true },
      });
      previousStoreName = prev?.name;
      await prisma.sparePartsCartItem.deleteMany({ where: { cartId: existingCart.id } });
      await prisma.sparePartsCart.delete({ where: { id: existingCart.id } });
      cartCleared = true;
    }

    // Upsert cart for (userId, storeId)
    const cart = await prisma.sparePartsCart.upsert({
      where:  { userId_storeId: { userId, storeId: product.storeId } },
      create: { userId, storeId: product.storeId },
      update: { updatedAt: new Date() },
    });

    // Increment quantity if product already in cart, else create
    const existing = await prisma.sparePartsCartItem.findFirst({
      where: { cartId: cart.id, productId },
    });

    let cartItem;
    if (existing) {
      cartItem = await prisma.sparePartsCartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity, updatedAt: new Date() },
      });
    } else {
      cartItem = await prisma.sparePartsCartItem.create({
        data: { cartId: cart.id, productId, quantity, unitPrice: product.price },
      });
    }

    return { cartItem, cart_cleared: cartCleared, previous_store: previousStoreName };
  }

  // ─────────────────────────────────────────────────────────────────
  // UPDATE ITEM  (quantity = 0 removes the item)
  // ─────────────────────────────────────────────────────────────────

  static async updateItem(userId: string, cartItemId: string, quantity: number) {
    const cart = await prisma.sparePartsCart.findFirst({ where: { userId } });
    if (!cart) throw new Error('Cart not found');

    const item = await prisma.sparePartsCartItem.findFirst({
      where: { id: cartItemId, cartId: cart.id },
    });
    if (!item) throw new Error('Cart item not found');

    if (quantity <= 0) {
      await prisma.sparePartsCartItem.delete({ where: { id: cartItemId } });
      return null;
    }

    return prisma.sparePartsCartItem.update({
      where: { id: cartItemId },
      data:  { quantity, updatedAt: new Date() },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // REMOVE ITEM
  // ─────────────────────────────────────────────────────────────────

  static async removeItem(userId: string, cartItemId: string) {
    const cart = await prisma.sparePartsCart.findFirst({ where: { userId } });
    if (!cart) throw new Error('Cart not found');

    await prisma.sparePartsCartItem.deleteMany({
      where: { id: cartItemId, cartId: cart.id },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CLEAR CART
  // ─────────────────────────────────────────────────────────────────

  static async clearCart(userId: string) {
    const cart = await prisma.sparePartsCart.findFirst({ where: { userId } });
    if (!cart) return;
    await prisma.sparePartsCartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.sparePartsCart.delete({ where: { id: cart.id } });
  }
}
