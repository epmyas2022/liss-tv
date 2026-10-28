export interface FlareSolverrCookies {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}

export interface FlareSolverrResponse {
  status: string;
  solution: {
    url: string;
    userAgent: string;
    responseHeaders: Record<string, string>;
    cookies: FlareSolverrCookies[];
  };
}

export interface FlareSolverrOutput {
  userAgent: string;
  cookies: FlareSolverrCookies[];
}
