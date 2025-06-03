interface DeeplinkParams {
  [key: string]: string | number | boolean;
}

export function generateDeeplink(options: {
  baseUrl: string;
  params: DeeplinkParams;
}): string {
  const { baseUrl, params } = options;
  const queryParams = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${baseUrl}?${queryParams}`;
}
