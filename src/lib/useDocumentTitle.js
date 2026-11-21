import { useEffect } from 'react';

/**
 * Sets document title on mount and resets on unmount
 */
export function useDocumentTitle(title, suffix = 'AR Hotel Menu') {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${suffix}` : suffix;
    return () => {
      document.title = prev;
    };
  }, [title, suffix]);
}

export default useDocumentTitle;
