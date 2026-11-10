import { useReactFlow } from "@xyflow/react";
import { useEffect } from "react";

/** Reveals only the thread just opened here, once its socket or query update reaches the DOM. */
export function useRevealThread(id: string | undefined) {
  const flow = useReactFlow();
  useEffect(() => {
    const reveal = () => {
      const element = document.querySelector<HTMLElement>(`[data-side-thread="${id}"]`);
      if (element === null) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const zoom = flow.getZoom();
      const center = flow.screenToFlowPosition({
        // oxlint-disable-next-line eslint/id-length -- React Flow coordinate names.
        x: rect.left + rect.width / 2,
        // oxlint-disable-next-line eslint/id-length -- React Flow coordinate names.
        y: rect.top,
      });
      void flow.setCenter(center.x, center.y + (globalThis.innerHeight / 2 - 140) / zoom, {
        zoom,
        duration: 300,
      });
      return true;
    };
    const observer = new MutationObserver(() => {
      if (reveal()) {
        observer.disconnect();
      }
    });
    if (id !== undefined && !reveal()) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      observer.disconnect();
    };
  }, [flow, id]);
}
