import { describe, expect, it } from "vitest";
import { networkConfig } from "@/config/network";
import { spentTodayUsd } from "@/lib/ledger";

const payer = "0x3248043657C22fcd7E7662886028Cc94E6916Afd";

function fakeChain(head: bigint, transfers: { block: bigint; value: bigint }[]) {
  const ranges: [bigint, bigint][] = [];
  return {
    ranges,
    client: {
      getBlockNumber: async () => head,
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        ranges.push([fromBlock, toBlock]);
        return transfers.filter((t) => t.block >= fromBlock && t.block <= toBlock).map((t) => ({ args: { value: t.value } }));
      },
    } as never,
  };
}

describe("spentTodayUsd", () => {
  it("sums today's USDC transfers from the payer, from midnight UTC", async () => {
    const now = new Date("2026-10-23T01:00:00Z"); // 3600 s since midnight = 1800 blocks at 2 s
    const { client, ranges } = fakeChain(100_000n, [
      { block: 98_100n, value: 10_000n }, // before midnight
      { block: 98_300n, value: 10_000n },
      { block: 99_999n, value: 20_000n },
    ]);
    expect(await spentTodayUsd(payer, networkConfig(), client, now)).toBeCloseTo(0.03);
    expect(ranges[0][0]).toBe(98_200n);
  });
  it("splits a full day into ranges a public RPC accepts", async () => {
    const { client, ranges } = fakeChain(1_000_000n, []);
    await spentTodayUsd(payer, networkConfig(), client, new Date("2026-10-23T23:59:00Z"));
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges.every(([a, b]) => b - a < 10_000n)).toBe(true);
    expect(ranges.at(-1)?.[1]).toBe(1_000_000n);
  });
});
