// ─────────────────────────────────────────────────────────────
//  Fenêtre modale accessible : Échap et clic à l'extérieur pour fermer,
//  focus placé dans la fenêtre (et gardé dedans), défilement de la page
//  bloqué, fenêtres empilables (Échap ne ferme que celle du dessus).
//  Avec `onSubmit`, la fenêtre entière est un <form> : le bouton de
//  validation peut ainsi vivre dans le pied de fenêtre.
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const pile = [];
const FOCUSABLES = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({
  title, description, icon = null, tone = null, size = 'md', className = '',
  onClose, onSubmit, footer, busy = false, bare = false, children,
}) {
  const id = useId();
  const ref = useRef(null);
  const pressionDehors = useRef(false);
  const fermer = useRef(onClose);
  fermer.current = busy ? null : onClose;

  useEffect(() => {
    pile.push(id);
    document.body.classList.add('has-modal');
    const precedent = document.activeElement;
    const el = ref.current;
    const cible = el.querySelector('[data-autofocus]')
      || el.querySelector('.modal-body input:not([type="hidden"]):not([disabled]), .modal-body select, .modal-body textarea')
      || el;
    cible.focus({ preventScroll: true });

    const onKey = (e) => {
      if (pile[pile.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        fermer.current?.();
      } else if (e.key === 'Tab') {
        const f = [...el.querySelectorAll(FOCUSABLES)].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const [premier, dernier] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
        else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = pile.indexOf(id);
      if (i >= 0) pile.splice(i, 1);
      if (pile.length === 0) document.body.classList.remove('has-modal');
      if (precedent && document.contains(precedent)) precedent.focus({ preventScroll: true });
    };
  }, [id]);

  const Racine = onSubmit ? 'form' : 'div';

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { pressionDehors.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressionDehors.current) fermer.current?.(); }}
    >
      <Racine
        ref={ref}
        className={`modal modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        tabIndex={-1}
        onSubmit={onSubmit}
      >
        <div className="modal-header">
          {icon && <div className={`modal-icon${tone === 'danger' ? ' is-danger' : ''}`}>{icon}</div>}
          <div className="modal-heading">
            <h2 className="modal-title" id={`${id}-titre`}>{title}</h2>
            {description && <p className="modal-desc">{description}</p>}
          </div>
          {onClose && (
            <button type="button" className="btn btn-ghost btn-icon btn-sm modal-close"
                    onClick={() => fermer.current?.()} disabled={busy} aria-label="Fermer">
              <X />
            </button>
          )}
        </div>
        {bare ? children : <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </Racine>
    </div>,
    document.body,
  );
}
