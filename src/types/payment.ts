/**
 * example:
 * {"currency": "SGD", "defaultPaymentToken": "vusd", "merchantName": "Test Outlet", "merchantSolanaAddress": "2abpx-je3z6-rotu4-hy43o-swi3m-szdov-qgwx2-hh6jf-7neqg-ykldx-6ae", "orderId": "1374038180646748160", "orderValue": "0.01", "paymentStatus": "new", "secondVerification": true, "supportTokenList": [{"address": undefined, "isNative": true, "symbol": "SOL"}, {"address": undefined, "isNative": false, "symbol": "vusd"}], "transaction_limit": 1000, "transaction_total": 600.023052}
 * **/

export interface Order {
  currency: string;
  defaultPaymentToken: string;
  merchantName: string;
  orderId: string;
  orderValue: string;
  paymentStatus: "new" | "success" | "faile" | "pending";
  secondVerification: boolean;
  supportTokenList: Token[];
  transaction_limit?: number;
  transaction_total?: number;
  createTime: number;
  paymentResult?: {
    symbol: string;
    amount: string;
    txHash: string;
    gasFee: string;
  };
}

export interface Token {
  chainName?: string;
  tokenAddress?: string;
  isNative: boolean;
  symbol: string;
  decimal: number;
  paymentAddress: string;
}

export interface TransactionParams {
  from: string;
  to: string;
  tokenAmount: string | bigint;
  tokenAddress?: string;
  orderId: string;
}

export interface CoinCalculator {
  tokenPrice?: string;
  payTokenAmount: string;
  payTokenSymbol: string;
  payTokenDecimal: number;
}

export type { Transaction } from "@solana/web3.js";
