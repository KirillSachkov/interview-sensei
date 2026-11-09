import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

/**
 * The open menu under its button. A click outside `root`, the button and the menu, or Escape
 * closes it.
 */
function MenuPopup({
  id,
  label,
  root,
  close,
  children,
}: {
  id: string;
  label: string;
  root: RefObject<HTMLElement | null>;
  close: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !(root.current?.contains(event.target) ?? false)) {
        close();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [root, close]);
  return (
    <div id={id} role="menu" aria-label={label} className="island menu">
      {children}
    </div>
  );
}

/** A button that opens a menu under it; `children` gets `close` to close it after a choice. */
export function Menu({
  label,
  button,
  children,
}: {
  /** The menu's accessible name. */
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  return (
    <div className="menu-root" ref={root}>
      <button
        type="button"
        className="ghost menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {button}
        <span aria-hidden="true" className="caret">
          ▾
        </span>
      </button>
      {open ? (
        <MenuPopup id={menuId} label={label} root={root} close={close}>
          {children(close)}
        </MenuPopup>
      ) : null}
    </div>
  );
}

/** One choice in a Menu; `checked` marks the current one. */
export function MenuChoice({
  checked,
  disabled = false,
  onChoose,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      disabled={disabled}
      className="menu-choice"
      onClick={onChoose}
    >
      <span aria-hidden="true" className="check">
        {checked ? "✓" : ""}
      </span>
      <span className="menu-choice-body">{children}</span>
    </button>
  );
}
