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

export interface Order {
  id: string;
  date: string;
  status: 'Delivered' | 'In Transit' | 'Processing';
  items: OrderItem[];
  total: number;
  uid?: string;
  preferredDeliveryDate?: string;
  deliveryOption?: 'delivery' | 'pickup';
}

export interface CartLine {
  product: Product;
  quantity: number;
  preferredDeliveryDate: string;
}
