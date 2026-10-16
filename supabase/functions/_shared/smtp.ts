/**
 * §3.10 Stage 4: the one way this codebase opens an SMTP connection. nodemailer 10.0.14,
 * configured exactly as docs/SMTP-Library-Security-Review.md §5 requires, so `email-dispatch`
 * and `email-inbox` (its files-dropped note) cannot drift apart on a safety setting.
 */
import nodemailer from "nodemailer";
import type { EmailConfig } from "./email.ts";

export function smtpTransport(cfg: EmailConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Never downgrade: TLS from the first byte on 465, certificates checked. The local mail
    // catcher (no credentials, see emailConfigFromEnv) is the only plain connection allowed.
    requireTLS: cfg.secure,
    ignoreTLS: !cfg.secure,
    tls: { rejectUnauthorized: true, servername: cfg.host },
    ...(cfg.user && cfg.password ? { auth: { user: cfg.user, pass: cfg.password } } : {}),
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Its logger prints whole messages, addresses and words included.
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
