import { Panel, ReactFlow, useReactFlow, useViewport } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
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

// The top bar islands float over the canvas, so the fitted view starts below them.
const fitPadding = { top: "112px", bottom: "96px", left: "48px", right: "48px" } as const;

/**
 * Fits the view again when `fitKey` changes, such as when a new Target gets its plan: the canvas
 * fits only when it opens, and the zone that grew would go under the zoom island. The zones measure
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
        minZoom={0.25}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: fitPadding, maxZoom: 1 }}
      >
        <ZoomControls />
        <FitOnChange fitKey={fitKey} />
      </ReactFlow>
    </section>
  );
}
