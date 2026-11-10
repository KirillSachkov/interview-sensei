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
  buttonLabel,
  children,
}: {
  /** The menu's accessible name. */
  label: string;
  button: ReactNode;
  /** The button's accessible name when its content is only a symbol. */
  buttonLabel?: string;
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
        aria-label={buttonLabel}
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

/** A switch in a Menu that stays open after a click, such as «Наполнять в фоне». */
export function MenuCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      className="menu-choice"
      onClick={onToggle}
    >
      <span aria-hidden="true" className="check">
        {checked ? "✓" : ""}
      </span>
      <span className="menu-choice-body">{children}</span>
    </button>
  );
}

/** One action in a Menu, such as «В архив»; `hint` explains it or why it is disabled. */
export function MenuItem({
  disabled = false,
  hint,
  onChoose,
  children,
}: {
  disabled?: boolean;
  hint?: string;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="menu-choice"
      onClick={onChoose}
    >
      <span aria-hidden="true" className="check" />
      <span className="menu-choice-body">
        <span>{children}</span>
        {hint === undefined ? null : <span className="hint">{hint}</span>}
      </span>
    </button>
  );
}
