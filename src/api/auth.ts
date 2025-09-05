import { fetchInstance } from "./index";

// google oauth2

export async function getGoogleOauth2Url(params: {
  state: string;
}): Promise<string> {
  const res = await fetchInstance.get(
    `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/google`,
    {
      params,
    }
  );

  return res.url;
}
