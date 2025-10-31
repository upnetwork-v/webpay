export interface OrderResponse {
  code: number;
  data: Order;
  msg: string;
}

export interface Order {
  acquirerId: number;
  acquirerOrderId: string;
  currency: string;
  fiatAmount: number;
  id: string;
  preferredRoutes?: PreferredRoute[];
  selectionMode: "acquirer" | "user" | "either";
  status: 1 | 2;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
  merchantName: string;
  tx?: TransactionResult;
  [property: string]: unknown;
}

export interface PreferredRoute {
  chainName: string;
  payToAddress: string;
  tokenAddress: string;
  tokenAmount: number;
  tokenDecimals: number;
  tokenPrice: string;
  tokenSymbol: string;
  [property: string]: unknown;
}

export interface TransactionResult {
  txHash: string;
  gasFee: string;
  fromAddress: string;
  toAddress: string;
  symbol: string;
  memo: string;
  amount: string;
  orderId: string;
}

export interface TransactionParams {
  from: string;
  to: string;
  tokenAmount: string | bigint;
  tokenAddress?: string;
  orderId: string;
}

export type { Transaction } from "@solana/web3.js";
