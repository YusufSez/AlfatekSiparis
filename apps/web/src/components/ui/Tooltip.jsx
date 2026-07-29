import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ label, children }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  function updatePos() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let top = r.top - gap;
    let left = r.left + r.width / 2;
    // Keep bubble on-screen horizontally; vertical prefers above, falls below if clipped.
    const pad = 8;
    left = Math.min(Math.max(left, pad + 60), window.innerWidth - pad - 60);
    if (r.top < 48) {
      top = r.bottom + gap;
      setCoords({ top, left, place: 'below' });
      return;
    }
    setCoords({ top, left, place: 'above' });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onReposition = () => updatePos();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  if (!label) return children;

  return (
    <span
      className="tooltip-wrap"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        createPortal(
          <span
            className={`tooltip-bubble tooltip-bubble--portal is-open place-${coords.place || 'above'}`}
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
