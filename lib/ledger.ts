import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import type { NetworkConfig } from "@/config/network";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const BLOCK_SECONDS = 2; // Base and Base Sepolia
const CHUNK = 10_000n; // blocks per getLogs call; public RPCs cap the range

type LogReader = Pick<PublicClient, "getBlockNumber" | "getLogs">;

/**
 * USDC the agent wallet has sent since 00:00 UTC, read from chain. x402 "exact" payments settle as
 * USDC transfers from the payer, so this is the day's spend across every process and restart, with no
 * database. Payments not yet settled are missed, so a burst of concurrent runs can overshoot slightly.
 */
export async function spentTodayUsd(payer: `0x${string}`, network: NetworkConfig, client: LogReader = rpcClient(network), now = new Date()): Promise<number> {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const head = await client.getBlockNumber();
  const back = BigInt(Math.ceil((now.getTime() - midnight) / 1000 / BLOCK_SECONDS));
  let total = 0n;
  for (let from = head > back ? head - back : 0n; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
    const logs = await client.getLogs({ address: network.usdcAddress, event: TRANSFER, args: { from: payer }, fromBlock: from, toBlock: to });
    for (const log of logs) total += log.args.value ?? 0n;
  }
  return Number(total) / 1e6; // USDC has 6 decimals
}

const rpcClient = (network: NetworkConfig): LogReader => createPublicClient({ transport: http(network.rpcUrl) });
