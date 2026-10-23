/**
 * All chain- and network-specific values live here and come from env vars.
 * Moving from testnet to mainnet must be a config change, never a code change.
 */
export interface NetworkConfig {
  nodeUrl: string;
  chainId: `${string}:${string}`;
  usdcAddress: `0x${string}`;
  explorerTxUrl: string;
  rpcUrl: string; // read-only chain access, used to total today's spend
}

export function networkConfig(env: NodeJS.ProcessEnv = process.env): NetworkConfig {
  return {
    nodeUrl: (env.TELEGRAPH_NODE_URL ?? "https://devnode.telegraphprotocol.com").replace(/\/$/, ""),
    chainId: (env.CHAIN_ID ?? "eip155:84532") as NetworkConfig["chainId"],
    usdcAddress: (env.USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`,
    explorerTxUrl: env.EXPLORER_TX_URL ?? "https://sepolia.basescan.org/tx/",
    rpcUrl: env.RPC_URL ?? "https://base-sepolia-rpc.publicnode.com", // sepolia.base.org caps getLogs at 200 blocks
  };
}

export interface SpendConfig {
  maxPerPackUsd: number;
  maxPerDayUsd: number;
  providerTimeoutMs: number;
  providersPerIntent: number;
}

export function spendConfig(env: NodeJS.ProcessEnv = process.env): SpendConfig {
  return {
    maxPerPackUsd: Number(env.MAX_SPEND_PER_PACK_USD ?? 0.2),
    maxPerDayUsd: Number(env.MAX_SPEND_PER_DAY_USD ?? 2),
    providerTimeoutMs: Number(env.PROVIDER_TIMEOUT_MS ?? 15000),
    providersPerIntent: Number(env.PROVIDERS_PER_INTENT ?? 2),
  };
}
