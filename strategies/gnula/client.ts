import https from "https";
import nodeFetch, { RequestInit, Response } from "node-fetch";

export const GNULA_BASE_URL = "https://ww3.gnulahd.nu/";

// Gnula uses a certificate chain that standard Node.js environments might reject.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: GNULA_BASE_URL,
  "Accept-Language": "es-419,es;q=0.9",
};

/**
 * Executes an HTTP request against Gnula with appropriate headers and SSL bypass agent.
 */
export async function gnulaFetch(
  endpointOrUrl: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = endpointOrUrl.startsWith("http")
    ? endpointOrUrl
    : `${GNULA_BASE_URL}${endpointOrUrl.replace(/^\/+/, "")}`;

  return nodeFetch(url, {
    agent: httpsAgent,
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...options.headers,
    },
  });
}
