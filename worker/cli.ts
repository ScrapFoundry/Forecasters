/**
 * VPS commands (the payer key never leaves the VPS):
 *   npm run imd -- probe      free: quotes our bodies + reads one 402 challenge, signs nothing
 *   npm run imd -- wallet     payer address, IMD / ETH balance, Permit2 allowance
 *   npm run imd -- approve    one time IMD approval to Permit2 (costs gas)
 *   npm run imd -- tick       run one pipeline tick now
 */
import { probe } from "@/lib/forecasters/probe";
import { approvePermit2, walletStatus } from "@/lib/imd/paid";
import { tick } from "@/lib/forecasters/pipeline";

const cmd = process.argv[2];
const print = (x: unknown) => console.log(JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

async function main() {
  switch (cmd) {
    case "probe":
      return print(await probe());
    case "wallet":
      return print(await walletStatus());
    case "approve":
      return print({ txHash: await approvePermit2() });
    case "tick":
      return print(await tick());
    default:
      console.log("usage: npm run imd -- probe | wallet | approve | tick");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  if (e && typeof e === "object" && "detail" in e) print((e as { detail: unknown }).detail);
  process.exit(1);
});
