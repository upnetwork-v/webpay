import type { Order, CoinCalculator } from "@/types/payment";

export async function getOrderById(orderId: string): Promise<Order> {
  // Mock order data
  // 延时1秒
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (orderId === "1") {
    // Return SPL token payment order
    return {
      currency: "SGD",
      defaultPaymentToken: "USDC",
      merchantName: "Test Outlet",
      merchantSolanaAddress: "9iusfh8hawwYU3iMW8UqNSR1wjbWTy6UkJKMZ8D65Fx3",
      orderId,
      orderValue: "0.01",
      paymentStatus: "new",
      secondVerification: true,
      supportTokenList: [
        {
          address: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
          isNative: false,
          symbol: "USDC",
        },
      ],
      transaction_limit: 1000,
      transaction_total: 600.023052,
    };
  } else {
    // Return SOL payment order
    return {
      currency: "SGD",
      defaultPaymentToken: "SOL",
      merchantName: "Test Outlet",
      merchantSolanaAddress: "9iusfh8hawwYU3iMW8UqNSR1wjbWTy6UkJKMZ8D65Fx3",
      orderId,
      orderValue: "0.01",
      paymentStatus: "new",
      secondVerification: true,
      supportTokenList: [
        {
          address: undefined,
          isNative: true,
          symbol: "SOL",
        },
      ],
      transaction_limit: 1000,
      transaction_total: 600.023052,
    };
  }
}

export async function coinCalculatorQuery(params: {
  orderValue: string;
  tokenAddress?: string;
}): Promise<CoinCalculator> {
  // Mock coin calculator data
  // 延时1秒
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    orderValue: params.orderValue,
    tokenAddress: params.tokenAddress,
    tokenAmount: "5",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
  };
}
