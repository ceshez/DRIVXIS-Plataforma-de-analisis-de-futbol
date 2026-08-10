import { type AppLocale } from "@/lib/preferences";

type PasswordResetEmail = {
  to: string;
  name: string;
  code: string;
  locale: AppLocale;
  purpose: "recovery" | "authenticated-change";
  idempotencyKey: string;
};

const DRIVXIS_EMAIL_LOGO_BASE64 = "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIwIDAgMTAwMCAxMDAwIiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgc3R5bGU9ImZpbGwtcnVsZTpldmVub2RkO2NsaXAtcnVsZTpldmVub2RkO3N0cm9rZS1saW5lam9pbjpyb3VuZDtzdHJva2UtbWl0ZXJsaW1pdDoyOyI+PHJlY3QgeD0iLTIyLjc0IiB5PSItMTEuNzM3IiB3aWR0aD0iMTA0NS40NzkiIGhlaWdodD0iMTAzOS40MTUiIHN0eWxlPSJmaWxsOm5vbmU7Ii8+PGc+PHBhdGggZD0iTTM4NS43MzMsNzUzLjg0N2MwLDAgLTEuOTM0LDY2LjExMSAtMzkuODQ2LDgwLjIzOWMwLDAgLTExLjgwMSwzLjgyMiAtMjUuNjg4LC04Ljk5N2MwLDAgLTE2LjI1NiwtMjUuMjc1IDMzLjE1LC01NC42NTFsMzQ0LjA2NSwtMTc2LjI3bC0xMy4wNCwtMjAuMTE5YzAsMCAtMjkyLjI3NywxMzguNDc2IC0zNTUuMzAzLDE4NC4zMDJjLTI0Ljg3NiwxOC4wODcgLTU0LjQxMyw0My45OTkgLTI0LjIzNSw4OC4zMDNjMCwwIDQ2LjI4OSwzOS41OSA4NS40NTQsLTE4LjY5NGMwLDAgMTcuNzk2LC0zOC41OSAxOC44MzUsLTg2LjA5NiIgc3R5bGU9ImZpbGw6I2ZmZjsiLz48cGF0aCBkPSJNNjM0LjY3NCw0ODAuMjgxYy0zLjEyNCw4LjY4MyAxMi4zLDE4LjA3NiAxOC4wOTMsMTQuNTU0YzAuNjU3LDAuNjEzIDE5LjA2MiwtOC44MjEgMjIuNzQ3LC0xMC40OTljOS4zMjQsLTQuMjQ1IC0xOS4yNDEsLTE2LjkzNSAtMTkuODI0LC0xNS4zYy00LjI5NywtMC42MzQgLTIwLjMxNCw5LjI5MiAtMjEuMDE2LDExLjI0NVoiIHN0eWxlPSJmaWxsOiNmZmY7Ii8+PHBhdGggZD0iTTQwNS4xNjIsMjY0LjEyMWwtMzIuNTksLTM0LjI2MmMwLDAgLTIzLjQ0LC0zNC45NDUgNC44ODMsLTQ1LjgxOWMyOC4zMjMsLTEwLjg3NCAyOC44MTIsNTAuOTUxIDI4LjgxMiw1MC45NTFsLTE4LjUxNCw0ODguMjYzbDI0LjA4MywtMTIuODg3bDE4LjYyNCwtNDc4LjAxOGMwLDAgLTIuMzc0LC03Ny44ODcgLTQ4LjE1NSwtNzYuMTY4Yy00NS43ODEsMS43MTggLTQ4LjE3Myw0Mi44NyAtMzkuODA4LDY1LjMxNmM4LjM0OSwyMi40MDQgNy45ODcsMzIuMjY5IDYxLjM4MSw3Ni41MTgiIHN0eWxlPSJmaWxsOiNmZmY7Ii8+PHBhdGggZD0iTTY3Ny4zNTIsNDgyLjc4NmMwLDAgMjQuOTEzLDExLjAzOCA0Ni44MzcsMTEuMDM4YzIxLjkyNSwwIDMwLjY2OCwtMTEuNDA0IDMwLjY2OCwtMTEuNDA0YzAsMCA4LjY0OSwtMTguNCAtMTcuNDEyLC0yMi40NjRjMCwwIC0xMi4yMDksLTAuOTM4IC0yMi44NTMsNC4yOTlsLTIxNS4wNTQsMTA3LjAxM2wtMTAuMTM2LC0xNS44MDFsMjE4LjU4MSwtMTEzLjMwM2MwLDAgNDIuNDk0LC0xOC40NyA2NC4wNDcsMTUuNTdjMjEuNTUzLDM0LjA0MSAtMTkuODcxLDU0Ljk1MyAtMjYuNTk3LDU2LjYzMmMwLDAgLTQxLjEyNywxNS4yNCAtOTIuMjUzLC0xOS41NTFsLTIyNy4xNDYsLTE3Ni4wNjdsMS42MTcsLTMyLjgzNGwyMjguNTY4LDE4My4wODNsMjEuMTMzLDEzLjc5WiIgc3R5bGU9ImZpbGw6I2ZmZjsiLz48L2c+PC9zdmc+Cg==";

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendPasswordResetEmail(message: PasswordResetEmail) {
  if (!isEmailDeliveryConfigured()) return { configured: false, sent: false };

  const spanish = message.locale !== "en";
  const authenticatedChange = message.purpose === "authenticated-change";
  const subject = spanish
    ? (authenticatedChange ? "Confirma el cambio de contraseña en DRIVXIS" : "Código para cambiar tu contraseña de DRIVXIS")
    : (authenticatedChange ? "Confirm your DRIVXIS password change" : "Your DRIVXIS password reset code");
  const greeting = spanish ? `Hola ${message.name},` : `Hello ${message.name},`;
  const instruction = spanish
    ? (authenticatedChange ? "Estás a punto de cambiar tu contraseña. Confirma la operación con este código:" : "Usa este código de seguridad para crear una nueva contraseña:")
    : (authenticatedChange ? "You are about to change your password. Confirm the operation with this code:" : "Use this security code to create a new password:");
  const expiration = spanish
    ? "El código vence en 15 minutos y solo puede utilizarse una vez."
    : "The code expires in 15 minutes and can only be used once.";
  const ignore = spanish
    ? "Si no solicitaste el cambio, no ingreses el código y puedes ignorar este correo."
    : "If you did not request this change, do not enter the code and ignore this email.";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
        "User-Agent": "DRIVXIS/1.0",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.to],
        subject,
        text: `${greeting}\n\n${instruction}\n\n${message.code}\n\n${expiration}\n${ignore}`,
        html: `<div style="font-family:Arial,sans-serif;background:#0b0b0b;color:#f2f0ee;padding:32px"><div style="margin-bottom:24px"><img src="cid:drivxis-logo" alt="DRIVXIS" width="56" height="56" style="display:block"/><strong style="display:block;margin-top:8px;letter-spacing:2px;color:#ff6b2b">DRIVXIS</strong></div><p>${escapeHtml(greeting)}</p><p>${escapeHtml(instruction)}</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#ff6b2b">${message.code}</p><p>${escapeHtml(expiration)}</p><p style="color:#aaa">${escapeHtml(ignore)}</p></div>`,
        attachments: [{
          content: DRIVXIS_EMAIL_LOGO_BASE64,
          filename: "drivxis-logo.svg",
          content_id: "drivxis-logo",
          content_type: "image/svg+xml",
        }],
      }),
    });

    if (!response.ok) {
      console.error("Password reset email delivery failed.", { status: response.status });
      return { configured: true, sent: false };
    }
    return { configured: true, sent: true };
  } catch (error) {
    console.error("Password reset email delivery failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { configured: true, sent: false };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}
