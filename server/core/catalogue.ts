import data from "./catalogue.json" with { type: "json" };
import type { Product } from "./types.ts";

export const CATALOGUE_VERSION: string = data.version;
export const PRICE_POLICY: string = data.pricePolicy;
export const PRODUCTS: Product[] = data.products as Product[];
export const PRODUCT_BY_ID: Map<string, Product> = new Map(PRODUCTS.map((p) => [p.id, p]));

export function product(id: string): Product {
  const p = PRODUCT_BY_ID.get(id);
  if (!p) throw new Error(`Unknown product ${id}`);
  return p;
}
