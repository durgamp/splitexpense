import nodemailer from 'nodemailer';

/**
 * Sends an OTP verification email.
 *
 * Priority:
 *  1. Gmail SMTP  — set SMTP_USER + SMTP_PASS (Gmail App Password) in .env
 *  2. Resend API  — set RESEND_API_KEY in .env  (https://resend.com, free tier)
 *  3. Dev fallback — logs OTP to console when neither is configured
 *
 * Gmail setup (one-time):
 *  1. Enable 2-Step Verification on your Google account
 *  2. Go to https://myaccount.google.com/apppasswords
 *  3. Create an App Password → copy the 16-character code
 *  4. Add to backend/.env:
 *       SMTP_USER=you@gmail.com
 *       SMTP_PASS=xxxx xxxx xxxx xxxx   (the 16-char app password)
 */

function buildHtml(otp: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff">
      <h2 style="color:#6366f1;margin:0 0 8px;font-size:24px">SplitEase</h2>
      <p style="color:#374151;margin:0 0 24px;font-size:15px">Your one-time verification code is:</p>
      <div style="background:#f5f3ff;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px">
        <span style="font-size:44px;font-weight:700;letter-spacing:12px;color:#6366f1">${otp}</span>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:0">
        This code expires in 10 minutes.<br>Do not share it with anyone.
      </p>
    </div>
  `;
}

async function sendViaGmail(to: string, otp: string): Promise<void> {
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"SplitEase" <${user}>`,
    to,
    subject: `${otp} — your SplitEase verification code`,
    html: buildHtml(otp),
    text: `Your SplitEase verification code is: ${otp}\n\nExpires in 10 minutes. Do not share it.`,
  });
}

async function sendViaResend(to: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM ?? 'SplitEase <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${otp} — your SplitEase verification code`,
      html: buildHtml(otp),
      text: `Your SplitEase verification code is: ${otp}\n\nExpires in 10 minutes. Do not share it.`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend API error: ${res.status} ${detail}`);
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const hasGmail = process.env.SMTP_USER && process.env.SMTP_PASS;
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  if (hasGmail) {
    await sendViaGmail(to, otp);
    console.log(`[email] OTP sent to ${to} via Gmail`);
    return;
  }

  if (hasResend) {
    await sendViaResend(to, otp);
    console.log(`[email] OTP sent to ${to} via Resend`);
    return;
  }

  // Dev fallback — no email provider configured
  console.log(`\n[DEV EMAIL] ──────────────────────────────`);
  console.log(`  To:   ${to}`);
  console.log(`  OTP:  ${otp}`);
  console.log(`─────────────────────────────────────────\n`);
}
