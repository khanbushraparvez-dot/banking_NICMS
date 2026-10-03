import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const OTP_TTL_MS = 10 * 60 * 1000;

function json(res, status, body) {
  return res.status(status).json(body);
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function unb64url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function secret() {
  return process.env.OTP_SECRET || "";
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function makeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function verifySignedToken(token, expectedEmail, expectedPurpose) {
  const [encoded, providedSignature] = String(token || "").split(".");
  if (!encoded || !providedSignature || !safeEqual(sign(encoded), providedSignature)) {
    throw new Error("Invalid verification token.");
  }
  let payload;
  try { payload = JSON.parse(unb64url(encoded)); }
  catch { throw new Error("Invalid verification token."); }
  if (payload.email !== expectedEmail) throw new Error("OTP email does not match.");
  if (payload.purpose !== expectedPurpose) throw new Error("Invalid OTP purpose.");
  if (!payload.exp || payload.exp < Date.now()) throw new Error("OTP has expired. Please request a new one.");
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });

  if (!secret()) return json(res, 500, { error: "OTP_SECRET is not configured on Vercel." });

  const { action, email, otp, token, purpose = "verification", resetToken, password } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return json(res, 400, { error: "A valid email address is required." });
  }

  if (action === "send") {
    const code = makeOtp();
    const exp = Date.now() + OTP_TTL_MS;
    const safePurpose = purpose === "reset" ? "reset" : "verification";
    const payload = JSON.stringify({ email: normalizedEmail, purpose: safePurpose, exp, otpHash: hashOtp(code) });
    const encoded = b64url(payload);
    const signed = `${encoded}.${sign(encoded)}`;
    const from = process.env.RESEND_FROM_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;

    if (!from || !apiKey) return json(res, 500, { error: "Resend environment variables are not configured on Vercel." });

    const isReset = safePurpose === "reset";
    const subject = isReset ? "RESET PASSWORD – ARSKEIL SERVICES LLP" : "Login OTP for ARSKEIL SERVICES LLP";
    const heading = isReset ? "RESET PASSWORD" : "Login OTP for ARSKEIL SERVICES LLP";
    const message = isReset ? "Use the below OTP to reset your password." : "Use the OTP below to verify your official email and continue.";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [normalizedEmail],
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a1f2e"><h2>${heading}</h2><p>${message}</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px;text-align:center;background:#f7f3e5;border-radius:12px;color:#1a1f2e">${code}</div><p style="font-size:12px;color:#777">This OTP expires in 10 minutes. Do not share this OTP with anyone.</p></div>`
      })
    });

    const data = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) return json(res, 502, { error: data?.message || data?.error?.message || "Resend could not send the OTP." });
    return json(res, 200, { ok: true, token: signed, expiresAt: exp });
  }

  if (action === "verify") {
    if (!token || !otp) return json(res, 400, { error: "OTP and verification token are required." });
    try {
      const safePurpose = purpose === "reset" ? "reset" : "verification";
      const payload = verifySignedToken(token, normalizedEmail, safePurpose);
      if (!safeEqual(hashOtp(String(otp).trim()), payload.otpHash)) return json(res, 400, { error: "Invalid OTP. Please enter the latest code." });
      const response = { ok: true, verified: true };
      if (safePurpose === "reset") {
        const admin = getAdminClient();
        if (!admin) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on Vercel." });
        const { data: profile, error: profileError } = await admin.from("profiles").select("id,active").eq("email", normalizedEmail).maybeSingle();
        if (profileError || !profile?.id) return json(res, 404, { error: "No account found for this email address." });
        if (profile.active === false) return json(res, 403, { error: "This account is deactivated. Please contact the Vendor Admin." });
        const nonce = crypto.randomBytes(16).toString("hex");
        const resetExp = Date.now() + 10 * 60 * 1000;
        const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
        if (authUserError || !authUser?.user) return json(res, 500, { error: "Unable to verify the account for password reset." });
        const nextAppMeta = { ...(authUser.user.app_metadata || {}), ars_reset_nonce: nonce, ars_reset_exp: resetExp };
        const { error: metaError } = await admin.auth.admin.updateUserById(profile.id, { app_metadata: nextAppMeta });
        if (metaError) return json(res, 500, { error: "Unable to prepare password reset securely." });
        const resetPayload = JSON.stringify({ email: normalizedEmail, purpose: "password-reset", exp: resetExp, nonce });
        const resetEncoded = b64url(resetPayload);
        response.resetToken = `${resetEncoded}.${sign(resetEncoded)}`;
      }
      return json(res, 200, response);
    } catch (e) {
      return json(res, 400, { error: e.message || "Invalid or expired OTP." });
    }
  }

  if (action === "reset-password") {
    if (!resetToken || !password) return json(res, 400, { error: "Password reset verification is required." });
    if (String(password).length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    let resetPayload;
    try {
      resetPayload = verifySignedToken(resetToken, normalizedEmail, "password-reset");
    } catch (e) {
      return json(res, 400, { error: e.message || "Reset verification has expired." });
    }

    const admin = getAdminClient();
    if (!admin) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on Vercel." });

    const { data: profile, error: profileError } = await admin.from("profiles").select("id,active").eq("email", normalizedEmail).maybeSingle();
    if (profileError) return json(res, 500, { error: "Unable to verify the account for password reset." });
    if (!profile?.id) return json(res, 404, { error: "No account found for this email address." });
    if (profile.active === false) return json(res, 403, { error: "This account is deactivated. Please contact the Vendor Admin." });

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
    if (authUserError || !authUser?.user) return json(res, 500, { error: "Unable to verify the account for password reset." });
    const meta = authUser.user.app_metadata || {};
    if (!resetPayload?.nonce || meta.ars_reset_nonce !== resetPayload.nonce || Number(meta.ars_reset_exp || 0) < Date.now()) {
      return json(res, 400, { error: "This reset request has already been used or has expired. Please request a new OTP." });
    }

    const clearedMeta = { ...meta };
    delete clearedMeta.ars_reset_nonce;
    delete clearedMeta.ars_reset_exp;
    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password: String(password), app_metadata: clearedMeta });
    if (updateError) return json(res, 502, { error: updateError.message || "Unable to reset password." });
    return json(res, 200, { ok: true, passwordReset: true });
  }

  return json(res, 400, { error: "Unknown OTP action." });
}
