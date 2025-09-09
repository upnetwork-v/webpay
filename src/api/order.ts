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

// 更新订单状态
export type updateOrderStatusRequest = {
  collectWallet: string;
  cryptoAmount: number;
  cryptoSymbol: string;
  cryptoTxHash: string;
  payerWallet: string;
  paymentStatus: string;
  transactionId: number;
};
export type updateOrderStatusResponse = {
  code: number;
  data: updateOrderStatusData;
  msg: string;
  [property: string]: any;
};

export type updateOrderStatusData = {
  amount: null;
  app_user_id: string;
  collect_wallet: string;
  create_time: string;
  creator: string;
  crypto_amount: number;
  crypto_currency_rate: number;
  crypto_symbol: string;
  crypto_tx_hash: string;
  currency: null;
  id: string;
  modifier: null;
  modify_time: null;
  payer_wallet: string;
  payment_status: string;
  push_app_id: string;
  transaction_id: string;
  transaction_limit: number;
  transaction_total: number;
};

export async function updateOrderStatus(
  params: updateOrderStatusRequest
): Promise<updateOrderStatusData> {
  const data = await fetchInstance.post<updateOrderStatusResponse>(
    `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/google/uniwebOrder/updateOrder`,
    params
  );
  if (data.code === 200 && data.data) {
    return data.data;
  } else {
    throw new Error(data.msg);
  }
}
