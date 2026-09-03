"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { cn } from "@/lib/cn";

export interface NavLink {
  href: string;
  label: string;
}

interface PublicNavProps {
  links: readonly NavLink[];
  /** Below `md` the bar sits on a photo, so the hamburger is white. */
  overlay?: boolean;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The only client island in the public shell: desktop links need the current path for
 * `aria-current`, and the mobile menu is a native <dialog> (focus trap, Escape and the
 * backdrop come from the browser). Closes itself after navigation and hands focus back to
 * the button that opened it.
 */
export function PublicNav({ links, overlay = false }: PublicNavProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const openMenu = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    setOpen(true);
  };

  const closeMenu = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else setOpen(false);
  };

  // Route change → close. dialog.close() fires the `close` event, whose listener below
  // updates state, so there is no setState in this effect body.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, [pathname]);

  // <dialog> closes itself on Escape and via .close(); mirror that into state and return focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setOpen(false);
      triggerRef.current?.focus();
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      <nav aria-label="Primary" className="ml-1 hidden items-center gap-0.5 md:flex web:ml-2 web:gap-1">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "btn-icon tap-44 ml-auto size-9 md:hidden",
          overlay && "text-white",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="pub-menu"
        aria-label="Open menu"
        onClick={openMenu}
      >
        <Icon name="menu" size={20} />
      </button>

      <dialog
        id="pub-menu"
        ref={dialogRef}
        aria-label="Menu"
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-90 bg-surface-1 p-0 text-on-surface shadow-4 backdrop:bg-black/50"
        onClick={(event) => {
          // Backdrop click: the dialog element itself is the target only outside its content.
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div className="flex h-full flex-col p-5">
          <div className="flex items-center justify-between">
            <Link href="/" onClick={closeMenu}>
              <BrandWordmark size={26} />
            </Link>
            <button
              type="button"
              className="btn-icon size-11"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <nav aria-label="Primary" className="mt-6">
            <ul className="flex flex-col">
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "t-title flex min-h-11 items-center rounded-sm px-2 py-2.5",
                        active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Link href="/join" className="btn btn-filled btn-lg w-full">
              Create an account
            </Link>
            <Link href="/login" className="btn btn-outlined btn-lg w-full">
              Sign in
            </Link>
          </div>

          <ul className="t-fine mt-5 flex flex-wrap gap-x-4 gap-y-2 text-on-surface-variant">
            <li><Link href="/how-it-works">How it works</Link></li>
            <li><Link href="/legal/privacy">Privacy</Link></li>
            <li><Link href="/legal/terms">Terms</Link></li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
