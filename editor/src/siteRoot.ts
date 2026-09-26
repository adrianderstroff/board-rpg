/**
 * The site's root: where the runtime's own files (assets/…) are – the dev server's root while
 * developing, the folder above the editor in a static build (it lives at <site>/editor/).
 */
export const SITE_ROOT = typeof location === "undefined" ? "/" : new URL(import.meta.env.DEV ? "/" : "../", location.href).href;
