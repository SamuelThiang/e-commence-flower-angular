export interface Product {
  id: string;
  name: string;
  /** Display label from categories.name */
  category: string;
  /** FK to categories.id (UUID string) when returned by API */
  categoryId?: string;
  price: number;
  image: string;
  description: string;
  seasonal?: boolean;
  exclusive?: boolean;
  limited?: boolean;
  orderCount: number;
}

export interface UserAddress {
  id: string;
  address: string;
  isDefault: boolean;
  label: string;
  uid?: string;
}

export interface ShippingDetail {
  address: string;
  hasGiftCard: boolean;
  giftMessage?: string;
  preferredDeliveryDate?: string;
}

export interface OrderItem {
  product: Product;
  quantity: number;
  shippingDetails?: ShippingDetail[];
}

/** POST /api/orders body line — server loads name/price/image from DB. */
export interface OrderSubmitLine {
  productId: string;
  quantity: number;
  shippingDetails?: ShippingDetail[];
}

export interface Order {
  id: string;
  date: string;
  /** DB values — see server `ORDER_STATUSES` */
  status:
    | 'Failed'
    | 'Processing'
    | 'In Transit'
    | 'Ready'
    | 'Completed';
  items: OrderItem[];
  total: number;
  uid?: string;
  preferredDeliveryDate?: string;
  deliveryOption?: 'delivery' | 'pickup';
}

export interface CartLine {
  /** Present when cart is loaded from `/api/cart` (logged-in). */
  lineId?: string;
  product: Product;
  quantity: number;
  preferredDeliveryDate: string;
  needsGiftcard?: boolean;
  giftcardMessage?: string;
}
