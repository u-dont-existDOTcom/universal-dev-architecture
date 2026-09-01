export function ownerMutationHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("mc_owner_csrf="))?.split("=").slice(1).join("=");
  return csrf ? { ...headers, "x-mission-control-csrf": decodeURIComponent(csrf) } : headers;
}
