import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
config();

export const PROGRAM_ID    = new PublicKey(process.env.PROGRAM_ID!);
export const THEO_MINT     = new PublicKey(process.env.THEO_MINT!);
export const RPC_URL       = process.env.RPC_URL!;
export const TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID;
export const connection    = new Connection(RPC_URL, "confirmed");

function poolIdBytes(id: number): Buffer {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id)); return buf;
}
function getPDA(seeds: Buffer[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}
export const PDAs = {
  globalState:   () => getPDA([Buffer.from("global")], PROGRAM_ID),
  rolloverVault: () => getPDA([Buffer.from("rollover_vault")], PROGRAM_ID),
  pool:          (id: number) => getPDA([Buffer.from("pool"), poolIdBytes(id)], PROGRAM_ID),
  vault:         (id: number) => getPDA([Buffer.from("vault"), poolIdBytes(id)], PROGRAM_ID),
  position:      (poolId: number, player: PublicKey) => getPDA([Buffer.from("position"), poolIdBytes(poolId), player.toBuffer()], PROGRAM_ID),
};
export function getReadonlyProvider() {
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../../idl.json"), "utf8"));
  return new anchor.Program(idl, provider);
}
