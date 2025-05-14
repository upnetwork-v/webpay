export interface Order {
  orderId: string;
  amount: number;
  recipient: string;
  description: string;
  paymentType: "SOL" | "SPL";
  usdcMint?: string; // Only required for SPL token payments
}

export interface TransactionParams {
  from: string;
  to: string;
  amount: number;
  paymentType: "SOL" | "SPL";
  usdcMint?: string;
  orderId: string;
}
