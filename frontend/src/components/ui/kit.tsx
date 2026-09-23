import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./kit.module.css";

type Variant = "primary" | "ghost" | "danger" | "subtle";

export function Button({
  variant = "subtle",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = { primary: styles.btnPrimary, ghost: styles.btnGhost, danger: styles.btnDanger, subtle: styles.btnSubtle }[variant];
  return <button type="button" className={`${styles.btn} ${v} ${className}`} {...rest} />;
}

export function IconButton({
  tip,
  tipPos,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tip: string; tipPos?: "top" | "bottom" | "right" }) {
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${className}`}
      data-tip={tip}
      data-tip-pos={tipPos}
      aria-label={tip}
      {...rest}
    />
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className={styles.field} htmlFor={htmlFor}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

export interface DropdownOption {
  value: string;
  label: string;
}

export function Dropdown({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  containerClassName = "",
}: {
  id: string;
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className={`${styles.dropdown} ${containerClassName}`}>
      <button
        id={id}
        type="button"
        className={`${styles.dropdownTrigger} ${className}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <div className={styles.dropdownMenu} role="listbox" aria-label={`选择${label}`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={styles.dropdownOption}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function Badge({ tone = "neutral", children }: { tone?: "success" | "error" | "warn" | "neutral"; children: ReactNode }) {
  const t = { success: styles.badgeSuccess, error: styles.badgeError, warn: styles.badgeWarn, neutral: styles.badgeNeutral }[tone];
  return <span className={`${styles.badge} ${t}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" aria-label={label ?? "加载中"} className={styles.spinner} />
  );
}

/** 包住弹层内容：Esc 关闭 + 初始聚焦 + 简单焦点圈定。 */
export function useModalLayer(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((n) => !n.hasAttribute("disabled"));
    const list = focusables();
    (list[0] ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmText = "确认",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useModalLayer(open, onCancel);
  if (!open) return null;
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`glass-strong ${styles.modal}`} style={{ width: "min(420px, calc(100vw - 64px))" }} tabIndex={-1}>
        <h2 className={styles.modalTitle}>{title}</h2>
        <p className={styles.modalBody}>{body}</p>
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} autoFocus>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ToastHost({ toasts }: { toasts: { id: number; kind: "success" | "error" | "info"; text: string }[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.toastRegion} role="region" aria-label="通知" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={`glass-strong ${styles.toast}`}>
          <Badge tone={t.kind === "success" ? "success" : t.kind === "error" ? "error" : "neutral"}>
            {t.kind === "success" ? "成功" : t.kind === "error" ? "失败" : "提示"}
          </Badge>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
