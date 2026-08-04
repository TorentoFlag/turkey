const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function sitePath(path: string) {
  if (path.startsWith("#") || /^(?:https?:|mailto:|tel:)/.test(path)) return path;
  return `${basePath}${path}`;
}
