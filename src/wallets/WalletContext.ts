import { createContext } from "react";
import type { WalletContextProps } from "./types/wallet"; // adjust import if needed

export const WalletContext = createContext<WalletContextProps | null>(null);
