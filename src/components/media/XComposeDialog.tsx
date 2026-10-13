"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "./XIcon";

export function XComposeDialog({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="x-compose-dialog" aria-label={title} onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="x-dialog-body">
      <header><button type="button" className="x-icon-button" onClick={onClose} aria-label="关闭"><XIcon name="close"/></button><span>{title}</span></header>
      {children}
    </div>
  </dialog>;
}
