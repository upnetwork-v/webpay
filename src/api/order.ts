import type { Order, CoinCalculator } from "@/types/payment";
import { fetchInstance } from "./index";

export async function getOrderById(orderId: string): Promise<Order> {
  const res = await fetchInstance.get(`/transaction/info`, {
    params: {
      id: orderId,
    },
    skipAuth: true,
  });

  if (res.code === 200 && res.data) {
    return res.data;
  } else {
    throw new Error(res.message);
  }
}

export async function coinCalculatorQuery(params: {
  id: string;
  symbol: string;
  tokenAddress?: string;
}): Promise<CoinCalculator> {
  const data = await fetchInstance.get(`/crypto/coin_calculator`, {
    params,
    skipAuth: true,
  });

  console.log("coinCalculatorQuery", data);

  if (data.code === 200 && data.data) {
    return data.data;
  } else {
    throw new Error(data.message);
  }
}
