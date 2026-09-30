"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { mainnet, base, sepolia } from "viem/chains";
import type { Chain } from "viem";
import { publicConfig } from "@/lib/config/public";

/**
 * Standard EVM wallet connection through the injected provider (EIP 1193 /
 * EIP 6963 discovery). Browsing never requires a wallet. No keys are ever
 * handled by FORECASTERS.
 */
const chain: Chain = [mainnet, base, sepolia].find((c) => c.id === publicConfig.chainId) ?? mainnet;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http() } as Record<number, ReturnType<typeof http>>,
  ssr: true,
  multiInjectedProviderDiscovery: true,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
