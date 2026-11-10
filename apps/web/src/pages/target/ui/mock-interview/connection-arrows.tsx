import { useId } from "react";

/** One quiet, rounded, dotted arrow style for the interview flow and its branches. */
export function ConnectionArrows({
  width,
  height,
  paths,
}: {
  width: number;
  height: number;
  paths: readonly string[];
}) {
  const marker = useId();
  return (
    <svg width={width} height={height} className="connection-arrows" aria-hidden="true">
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M2 1l6 4-6 4" className="connection-head" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path key={path} d={path} className="connection-line" markerEnd={`url(#${marker})`} />
      ))}
    </svg>
  );
}
