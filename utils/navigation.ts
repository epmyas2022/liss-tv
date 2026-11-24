/**
 * Client-safe navigation and provider detection utilities.
 * Contains no Node.js dependencies and can safely be bundled by Turbopack/Next.js client components.
 */

export function inferProviderFromLink(
  link?: string,
  context?: Record<string, unknown>,
): string | undefined {
  if (context?.provider && typeof context.provider === "string") {
    return context.provider;
  }
  if (!link) return undefined;
  const clean = link.toLowerCase();
  if (
    clean.includes("serieslan") ||
    Boolean(context?.player_url) ||
    Boolean(context?.tmdb_id)
  ) {
    return "serieslan";
  }
  if (
    clean.includes("cinecalidad") ||
    clean.startsWith("ver-pelicula/") ||
    clean.startsWith("/ver-pelicula/") ||
    clean.startsWith("ver-serie/") ||
    clean.startsWith("/ver-serie/") ||
    clean.startsWith("ver-el-episodio/") ||
    clean.startsWith("/ver-el-episodio/")
  ) {
    return "cinecalidad";
  }
  if (
    clean.includes("gnula") ||
    /^[a-z0-9_-]+-\d+x\d+/.test(clean.replace(/^\/+/, "")) ||
    clean.startsWith("ver/") ||
    clean.startsWith("/ver/")
  ) {
    return "gnula";
  }
  if (
    clean.includes("megadede") ||
    clean.includes("/vidurl/") ||
    /-[a-z0-9]{6}(?:#.*)?$/i.test(clean) ||
    /#s\d+-e\d+/i.test(clean)
  ) {
    return "megadede";
  }
  return undefined;
}

export function getPlayerHref(link: string): string {
  if (!link) return "/";

  // If full absolute URL with protocol, extract relative path + search + hash
  let raw = link.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      raw = parsed.pathname + parsed.search + parsed.hash;
    } catch {
      raw = raw.replace(/^https?:\/\/[^/]+/i, "");
    }
  }

  // Strip hash fragment completely (e.g. #s3-e7, #s3-e7/player)
  const hashIdx = raw.indexOf("#");
  if (hashIdx !== -1) {
    raw = raw.slice(0, hashIdx);
  }

  // Separate query string (if originally present)
  let queryString = "";
  const queryIdx = raw.indexOf("?");
  if (queryIdx !== -1) {
    queryString = raw.slice(queryIdx + 1);
    raw = raw.slice(0, queryIdx);
  }

  const querySuffix = queryString ? `?${queryString}` : "";
  const clean = raw.replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);

  // If already ends in /player, preserve route
  if (parts[parts.length - 1] === "player") {
    return `/${parts.join("/")}${querySuffix}`;
  }

  if (parts[0] === "pelicula" || parts[0] === "serie" || parts[0] === "anime") {
    const type = parts[0] === "anime" ? "serie" : parts[0];
    const slug = parts[1] || "";
    return `/${type}/${slug}/player${querySuffix}`;
  }

  // Gnula episode format, e.g. "ragna-crimson-1x01" or "breaking-bad-5x16"
  const gnulaMatch = clean.match(/^([^/]+)-\d+x\d+$/i);
  if (gnulaMatch) {
    return `/serie/${gnulaMatch[1]}/player${querySuffix}`;
  }

  // Gnula movie format, e.g. "ver/godzilla-minus-one"
  if (parts[0] === "ver" && parts[1]) {
    return `/pelicula/${parts[1]}/player${querySuffix}`;
  }

  // Cinecalidad movie & series formats
  if (parts[0] === "ver-pelicula" && parts[1]) {
    return `/pelicula/${parts[1]}/player${querySuffix}`;
  }
  if ((parts[0] === "ver-serie" || parts[0] === "ver-el-episodio") && parts[1]) {
    return `/serie/${parts[1]}/player${querySuffix}`;
  }

  return `/${parts.slice(0, 2).join("/")}/player${querySuffix}`;
}

export function formatFavoriteHref(item: { link: string; provider?: string }): string {
  const baseHref = item.link.startsWith("/") ? item.link : `/${item.link}`;
  if (!item.provider) return baseHref;
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}provider=${encodeURIComponent(item.provider)}`;
}
