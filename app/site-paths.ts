const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const normalizedBasePath = configuredBasePath.trim().replace(/^\/+|\/+$/g, "");

export const SITE_BASE_PATH = normalizedBasePath ? `/${normalizedBasePath}` : "";

export function publicPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_BASE_PATH}${normalized}`;
}
