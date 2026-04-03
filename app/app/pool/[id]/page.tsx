import { MOCK_POOLS } from "@/lib/mockData";
export function generateStaticParams() {
  return MOCK_POOLS.map((pool) => ({ id: pool.id }));
}
export { default } from "./PoolDetailClient";
