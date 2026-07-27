import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Viewport-safe action menu anchored under the trigger button.
 */
export default function ActionMenu({ label = 'İşlemler', items = [], align = 'end' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 160 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function place() {
      const btn = triggerRef.current.getBoundingClientRect();
      const menuEl = menuRef.current;
      const mw = menuEl?.offsetWidth || 180;
      const mh = menuEl?.offsetHeight || 120;
      const gap = 6;
      const pad = 8;

      let top = btn.bottom + gap;
      if (top + mh > window.innerHeight - pad) {
        top = Math.max(pad, btn.top - mh - gap);
      }

      let left = align === 'start' ? btn.left : btn.right - mw;
      if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
      if (left < pad) left = pad;

      setCoords({
        top,
        left,
        minWidth: Math.max(160, btn.width),
      });
    }

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e) {
      const t = e.target;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('touchstart', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  return (
    <div className="action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="btn ghost action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="action-menu-panel"
            role="menu"
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: coords.minWidth,
            }}
          >
            {items.map((item) => (
              <button
                key={item.id || item.label}
                type="button"
                role="menuitem"
                className={`action-menu-item ${item.tone ? `tone-${item.tone}` : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
