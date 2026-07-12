import { useEffect } from "react";

export default function Seo(props: {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  canonical?: string;
  noindex?: boolean;
}) {
  useEffect(() => {
    document.title = props.title;

    const setMeta = (attr: string, attrVal: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${attrVal}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, attrVal);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    if (props.description) {
      setMeta("name", "description", props.description);
      setMeta("property", "og:description", props.description);
      setMeta("name", "twitter:description", props.description);
    }

    setMeta("property", "og:title", props.title);
    setMeta("property", "og:type", props.ogType || "website");
    setMeta("property", "og:site_name", "TwinSeam Deals");
    setMeta("name", "twitter:title", props.title);
    setMeta("name", "twitter:card", "summary_large_image");

    if (props.ogImage) {
      setMeta("property", "og:image", props.ogImage);
      setMeta("name", "twitter:image", props.ogImage);
    }

    // Robots directive: pages opt-in to noindex (e.g. admin, account). Default is index,follow.
    // Google honors the crawler-specific `googlebot` directive over the generic `robots`,
    // so we must keep both in lockstep — otherwise a noindex page will still be indexed.
    const robotsValue = props.noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
    setMeta("name", "robots", robotsValue);
    setMeta("name", "googlebot", robotsValue);

    // Canonical link: keep one <link rel="canonical"> in sync with the current page.
    const canonicalHref =
      props.canonical ||
      (typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}`
        : undefined);
    if (canonicalHref) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.href = canonicalHref;
      setMeta("property", "og:url", canonicalHref);
    }
  }, [props.title, props.description, props.ogImage, props.ogType, props.canonical, props.noindex]);

  return null;
}
