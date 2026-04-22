export interface Product {
  id?: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id?: string;
  name: string;
}

export interface Quote {
  id?: string;
  productName: string;
  productId?: string;
  clientName: string;
  clientEmail: string;
  createdAt?: any;
}
