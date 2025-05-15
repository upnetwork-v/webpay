import type { Order } from "@/types/payment";

export async function getOrderById(orderId: string): Promise<Order> {
  // Mock order data
  // 延时1秒
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (orderId === "1") {
    // Return SPL token payment order
    return {
      orderId,
      amount: 0.5,
      usdcMint: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // Devnet USDC mint
      recipient: "9iusfh8hawwYU3iMW8UqNSR1wjbWTy6UkJKMZ8D65Fx3",
      description: "Test order for USDC payment",
      paymentType: "SPL",
    };
  } else {
    // Return SOL payment order
    return {
      orderId,
      amount: 0.01, // SOL amount
      recipient: "9iusfh8hawwYU3iMW8UqNSR1wjbWTy6UkJKMZ8D65Fx3",
      description: "Test order for SOL payment",
      paymentType: "SOL",
    };
  }
}
