export const getGoogleOauth2Url = (): string => {
  const scopes = import.meta.env.VITE_GOOGLE_SCOPES
    ? import.meta.env.VITE_GOOGLE_SCOPES.split(",")
    : [];
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
    redirect_uri: import.meta.env.VITE_GOOGLE_REDIRECT_URI || "",
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
  });
  return `${import.meta.env.VITE_GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
};
