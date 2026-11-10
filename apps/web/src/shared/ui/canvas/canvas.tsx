import { Panel, ReactFlow, useReactFlow, useViewport } from "@xyflow/react";
import type { Node, NodeProps, Viewport } from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

/**
 * One zone of the canvas, such as «Цель» or «Сессии». The canvas places zones from left to right
 * in the given order; `content` is the zone's widgets, stacked from top to bottom.
 */
export interface CanvasZone {
  readonly id: string;
  readonly title: string;
  /** A short muted line beside the title. */
  readonly hint?: string;
  /** The zone's width in canvas pixels; the height grows with the content. */
  readonly width: number;
  readonly minHeight?: number;
  /**
   * Canvas pixels to the right of the zone that a widget takes beyond `width`, such as an open
   * chat beside a card. The next zones move right by as much, so the widget covers none of them.
   */
  readonly overhang?: number;
  readonly content: ReactNode;
}

type ZoneNode = Node<{ zone: CanvasZone }, "zone">;

const zoneGap = 96;

/** A zone is one node that groups its widgets; the widgets are plain React inside it. */
function ZoneView({ data: { zone } }: NodeProps<ZoneNode>) {
  return (
    <section className="zone" aria-label={zone.title} style={{ width: zone.width }}>
      <header className="zone-head">
        <h2>{zone.title}</h2>
        {zone.hint === undefined ? null : <span className="muted">{zone.hint}</span>}
      </header>
      <div className="zone-frame" style={{ minHeight: zone.minHeight }}>
        {zone.content}
      </div>
    </section>
  );
}

const nodeTypes = { zone: ZoneView };

function zoneNodes(zones: readonly CanvasZone[]): ZoneNode[] {
  let left = 0;
  return zones.map((zone) => {
    const node: ZoneNode = {
      id: zone.id,
      type: "zone",
      // oxlint-disable-next-line eslint/id-length -- React Flow names the coordinates x and y.
      position: { x: left, y: 0 },
      data: { zone },
      // React Flow lets pointer events through a node that is neither selectable nor draggable;
      // the widgets of a zone take clicks, such as «Настроить цель».
      style: { pointerEvents: "all" },
    };
    left += zone.width + (zone.overhang ?? 0) + zoneGap;
    return node;
  });
}

/** The zoom island in the bottom left corner: out, current scale, in, fit. */
function ZoomControls() {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Panel position="bottom-left" className="island zoom" aria-label="Масштаб">
      <button
        type="button"
        className="ghost"
        aria-label="Уменьшить"
        onClick={() => void flow.zoomOut()}
      >
        −
      </button>
      <output aria-label="Текущий масштаб">{Math.round(zoom * 100)}%</output>
      <button
        type="button"
        className="ghost"
        aria-label="Увеличить"
        onClick={() => void flow.zoomIn()}
      >
        +
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => void flow.fitView({ padding: fitPadding, maxZoom: 1 })}
      >
        Показать всё
      </button>
    </Panel>
  );
}

/** How far one wheel step zooms, as React Flow counts it for the wheel over the canvas. */
function wheelZoomFactor(event: WheelEvent): number {
  const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
  // A trackpad pinch comes as a wheel with Ctrl and small steps: it zooms ten times faster.
  const pinch = event.ctrlKey && !lines ? 10 : 1;
  return 2 ** (-event.deltaY * (lines ? 0.05 : 0.002) * pinch);
}

/**
 * Ctrl or ⌘ with the wheel, and a pinch, zoom the canvas also over a widget that scrolls by
 * itself, such as the chat: React Flow leaves every wheel over a `nowheel` element to the element,
 * so the Candidate could not zoom with the pointer over the chat. The zoom keeps the point under
 * the pointer in place.
 */
function ZoomOverWidgets() {
  const flow = useReactFlow();
  useEffect(() => {
    const pane = document.querySelector<HTMLElement>(".canvas .react-flow");
    const zoom = (event: WheelEvent) => {
      const overWidget =
        event.target instanceof Element && event.target.closest(".nowheel") !== null;
      if (pane !== null && overWidget && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        void flow.setViewport(zoomedAt(flow.getViewport(), event, pane.getBoundingClientRect()));
      }
    };
    pane?.addEventListener("wheel", zoom, { capture: true, passive: false });
    return () => {
      pane?.removeEventListener("wheel", zoom, { capture: true });
    };
  }, [flow]);
  return null;
}

const minZoom = 0.25;
const maxZoom = 2;

/** The view after the wheel step, with the point under the pointer kept in place. */
function zoomedAt(view: Viewport, event: WheelEvent, pane: DOMRect): Viewport {
  const zoom = Math.min(Math.max(view.zoom * wheelZoomFactor(event), minZoom), maxZoom);
  const scale = zoom / view.zoom;
  const [left, top] = [event.clientX - pane.left, event.clientY - pane.top];
  // oxlint-disable-next-line eslint/id-length -- React Flow names the coordinates x and y.
  return { x: left - (left - view.x) * scale, y: top - (top - view.y) * scale, zoom };
}

// The top bar islands float over the canvas, so the fitted view starts below them.
const fitPadding = { top: "112px", bottom: "96px", left: "48px", right: "48px" } as const;

/**
 * Fits the view again when `fitKey` changes, such as when the «Сессии» zone appears: the canvas
 * fits only when it opens, and a new zone would stay out of sight. The zones measure
 * their new content in the next frame, so the fit waits for the frame after it.
 */
function FitOnChange({ fitKey }: { fitKey: string }) {
  const flow = useReactFlow();
  const fitted = useRef(fitKey);
  // Stays until the fit runs: a cleanup that cancels the frames leaves it for the next run.
  const pending = useRef(false);
  useEffect(() => {
    pending.current ||= fitted.current !== fitKey;
    fitted.current = fitKey;
    let measured = 0;
    const rendered = requestAnimationFrame(() => {
      measured = requestAnimationFrame(() => {
        if (pending.current) {
          pending.current = false;
          void flow.fitView({ padding: fitPadding, maxZoom: 1 });
        }
      });
    });
    return () => {
      cancelAnimationFrame(rendered);
      cancelAnimationFrame(measured);
    };
  }, [fitKey, flow]);
  return null;
}

/**
 * The infinite canvas of one Target. The wheel or trackpad moves it; the middle mouse button, or
 * Space with the left button, drags it; Ctrl or ⌘ with the wheel and a pinch change the scale. It
 * fits the view when it opens and again when `fitKey` changes.
 */
export function Canvas({
  zones,
  label,
  fitKey = "",
}: {
  zones: readonly CanvasZone[];
  label: string;
  fitKey?: string;
}) {
  const nodes = useMemo(() => zoneNodes(zones), [zones]);
  return (
    <section className="canvas" aria-label={label}>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        zoomActivationKeyCode={["Meta", "Control"]}
        minZoom={minZoom}
        maxZoom={maxZoom}
        fitView
        fitViewOptions={{ padding: fitPadding, maxZoom: 1 }}
      >
        <ZoomControls />
        <ZoomOverWidgets />
        <FitOnChange fitKey={fitKey} />
      </ReactFlow>
    </section>
  );
}
