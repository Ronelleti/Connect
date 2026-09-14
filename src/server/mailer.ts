import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required to send email.");
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password }
  });
  return cachedTransporter;
}

export async function sendMail(input: { to: string; subject: string; html: string; text: string }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text
  });
}
