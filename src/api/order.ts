import type { Order, OrderResponse } from "@/types/payment";
import { fetchInstance } from "./index";

export async function getPreOrder(orderId: string): Promise<Order> {
  const response = await fetchInstance.get<OrderResponse>(
    `/crypto-receive-payment-order/get`,
    {
      params: {
        orderId,
      },
    }
  );

  if (response.code === 200 && response.data) {
    return response.data;
  } else {
    throw new Error(response.msg || "Failed to get order");
  }
}

export async function createOrder(orderId: string): Promise<Order> {
  const response = await fetchInstance.post<OrderResponse>(
    `/crypto-payment-order/create`,
    {
      orderId,
    }
  );

  if (response.code === 200 && response.data) {
    return response.data;
  } else {
    throw new Error(response.msg || "Failed to get order");
  }
}

export async function getOrderById(orderId: string): Promise<Order> {
  const response = await fetchInstance.get<OrderResponse>(
    `/crypto-payment-order/get`,
    {
      params: {
        orderId,
      },
    }
  );

  if (response.code === 200 && response.data) {
    return response.data;
  } else {
    throw new Error(response.msg || "Failed to get order");
  }
}
