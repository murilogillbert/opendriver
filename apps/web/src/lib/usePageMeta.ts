import { useEffect } from "react";

const BASE_TITLE = "DriverHub";

// Sets document.title (and optionally the meta description) for the current route.
// Restores the previous values on unmount so server-rendered defaults survive.
export function usePageMeta(input: { title?: string; description?: string }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute("content") ?? null;

    if (input.title) {
      document.title = input.title.includes(BASE_TITLE) ? input.title : `${input.title} | ${BASE_TITLE}`;
    }
    if (input.description && descriptionTag) {
      descriptionTag.setAttribute("content", input.description);
    }

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription != null) {
        descriptionTag.setAttribute("content", previousDescription);
      }
    };
  }, [input.title, input.description]);
}
