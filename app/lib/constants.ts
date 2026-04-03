import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J"
);

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://rpc.testnet.x1.xyz";

export const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "testnet";
