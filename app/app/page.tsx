import { MOCK_POOLS } from "@/lib/mockData";

// Generate static params for all mock pools (for static export)
export function generateStaticParams() {
  return MOCK_POOLS.map((pool) => ({
    id: pool.id,
  }));
}

// Re-export the client component
export { default } from "./PoolDetailClient";
