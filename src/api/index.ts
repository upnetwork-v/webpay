// 使用 fetch 封装一个前端异步请求通用实例
// 使用环境变量 API_HOST 作为请求 host
// 默认设置请求头和超时时间，简化参数传递，类似 axios
// 支持自动添加认证 token

type RequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

interface RequestOptions extends Omit<RequestInit, "method" | "body"> {
  method?: RequestMethod;
  data?: any;
  params?: Record<string, any>;
  timeout?: number;
  skipAuth?: boolean; // 跳过自动添加认证头
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * 创建完整的请求URL
 */
const createFullUrl = (url: string, params?: Record<string, any>): string => {
  const baseUrl = import.meta.env.VITE_API_HOST || "";
  let fullUrl = url.startsWith("http")
    ? url
    : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;

  // 处理 query 参数
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    fullUrl += `${fullUrl.includes("?") ? "&" : "?"}${searchParams.toString()}`;
  }

  return fullUrl;
};

/**
 * 请求超时处理
 */
const timeoutPromise = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);
  });
};

/**
 * 处理响应
 */
const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  let data;
  try {
    data = isJson ? await response.json() : await response.text();
  } catch (error) {
    data = response.statusText;
  }

  if (!response.ok) {
    // 处理 401 认证失败
    if (response.status === 401) {
      // 动态导入避免循环依赖
      import("@/stores/authStore").then(({ useAuthStore }) => {
        useAuthStore.getState().logout();
        // 重定向到登录页面
        window.location.href = "/";
      });
    }

    const error = new Error(
      data?.message || response.statusText || "Request failed"
    );
    (error as any).response = {
      ...response,
      data,
    };
    throw error;
  }

  return data;
};

/**
 * 创建请求配置
 */
const createRequestConfig = (options: RequestOptions): RequestInit => {
  const { method = "GET", data, headers, skipAuth = false, ...rest } = options;

  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // 自动添加认证头
  if (!skipAuth) {
    try {
      // 动态导入避免循环依赖
      const authToken =
        typeof window !== "undefined" && localStorage.getItem("ontapay_auth")
          ? JSON.parse(localStorage.getItem("ontapay_auth") || "{}")?.state
              ?.authToken
          : null;

      if (authToken) {
        defaultHeaders.Authorization = `${authToken}`;
      }
    } catch (error) {
      console.warn("Failed to get auth token:", error);
    }
  }

  const config: RequestInit = {
    method,
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    ...rest,
  };

  // 处理请求体
  if (data && method !== "GET" && method !== "HEAD") {
    config.body = JSON.stringify(data);
  }

  return config;
};

/**
 * 封装的 fetch 请求实例
 */
export const fetchMethod = async <T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> => {
  const { timeout = DEFAULT_TIMEOUT, params } = options;
  const fullUrl = createFullUrl(url, params);
  const config = createRequestConfig(options);

  try {
    const response = (await Promise.race([
      fetch(fullUrl, config),
      timeoutPromise(timeout),
    ])) as Response;

    return await handleResponse(response);
  } catch (error) {
    console.error("Request failed:", error);
    throw error;
  }
};

// 为常用 HTTP 方法创建快捷方式
export const fetchInstance = {
  get: <T = any>(
    url: string,
    options: Omit<RequestOptions, "method" | "data"> = {}
  ) => fetchMethod<T>(url, { ...options, method: "GET" }),

  post: <T = any>(
    url: string,
    data?: any,
    options: Omit<RequestOptions, "method" | "data"> = {}
  ) => fetchMethod<T>(url, { ...options, method: "POST", data }),

  put: <T = any>(
    url: string,
    data?: any,
    options: Omit<RequestOptions, "method" | "data"> = {}
  ) => fetchMethod<T>(url, { ...options, method: "PUT", data }),

  delete: <T = any>(url: string, options: RequestOptions = {}) =>
    fetchMethod<T>(url, { ...options, method: "DELETE" }),

  patch: <T = any>(
    url: string,
    data?: any,
    options: Omit<RequestOptions, "method" | "data"> = {}
  ) => fetchMethod<T>(url, { ...options, method: "PATCH", data }),
};
