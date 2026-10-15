// ─────────────────────────────────────────────────────────────
//  Retours utilisateur : notifications (toasts) et confirmations.
//  Remplace window.alert / confirm / prompt par des fenêtres maison.
//
//    const toast = useToast();
//    toast.success('Commande créée', { action: { label: 'Ouvrir', onClick } });
//    const confirmer = useConfirm();
//    if (await confirmer({ title, message, confirmLabel, tone: 'danger' })) …
// ─────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, Info, X, TriangleAlert } from 'lucide-react';
import Modal from './Modal.jsx';

const Ctx = createContext(null);

const ICONES = { success: CircleCheck, error: CircleAlert, info: Info };

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [question, setQuestion] = useState(null);
  const seq = useRef(0);
  const minuteurs = useRef(new Map()); // id → { timer, duree }

  const retirer = useCallback((id) => {
    clearTimeout(minuteurs.current.get(id)?.timer);
    minuteurs.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const armer = useCallback((id, duree) => {
    clearTimeout(minuteurs.current.get(id)?.timer);
    minuteurs.current.set(id, { duree, timer: setTimeout(() => retirer(id), duree) });
  }, [retirer]);

  const pousser = useCallback((type, message, opts = {}) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((t) => [...t.slice(-3), { id, type, message, action: opts.action }]);
    // Une notification avec action (« Annuler »…) reste plus longtemps.
    armer(id, opts.duree ?? (opts.action ? 10000 : type === 'error' ? 7000 : 4000));
    return id;
  }, [armer]);

  // Survol : la notification reste affichée tant que la souris est dessus.
  const suspendre = (id) => clearTimeout(minuteurs.current.get(id)?.timer);
  const reprendre = (id) => { const m = minuteurs.current.get(id); if (m) armer(id, Math.min(m.duree, 4000)); };

  const toast = useMemo(() => {
    const fn = (message, opts) => pousser('info', message, opts);
    fn.success = (message, opts) => pousser('success', message, opts);
    fn.error = (message, opts) => pousser('error', message, opts);
    fn.info = fn;
    return fn;
  }, [pousser]);

  const confirmer = useCallback((opts) => new Promise((resolve) => setQuestion({ ...opts, resolve })), []);

  const repondre = (ok) => {
    question?.resolve(ok);
    setQuestion(null);
  };

  const valeur = useMemo(() => ({ toast, confirmer }), [toast, confirmer]);
  const danger = question?.tone === 'danger';

  return (
    <Ctx.Provider value={valeur}>
      {children}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icone = ICONES[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`}
                 onMouseEnter={() => suspendre(t.id)} onMouseLeave={() => reprendre(t.id)}>
              <Icone />
              <span className="toast-msg">{t.message}</span>
              {t.action && (
                <button type="button" className="toast-action"
                        onClick={() => { retirer(t.id); t.action.onClick(); }}>
                  {t.action.icon}{t.action.label}
                </button>
              )}
              <button type="button" className="toast-close" onClick={() => retirer(t.id)} aria-label="Fermer">
                <X />
              </button>
            </div>
          );
        })}
      </div>

      {question && (
        <Modal
          size="sm"
          className="modal-confirm"
          title={question.title}
          icon={question.icon || (danger ? <TriangleAlert /> : <Info />)}
          tone={question.tone}
          onClose={() => repondre(false)}
          footer={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => repondre(false)}
                      data-autofocus={danger ? true : undefined}>
                {question.cancelLabel || 'Annuler'}
              </button>
              <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => repondre(true)}
                      data-autofocus={danger ? undefined : true}>
                {question.confirmLabel || 'Confirmer'}
              </button>
            </>
          )}
        >
          {question.message}
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx).toast;
export const useConfirm = () => useContext(Ctx).confirmer;
