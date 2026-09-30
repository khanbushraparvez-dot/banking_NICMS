import crypto from "crypto";

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

function sign(value) {
  return crypto
    .createHmac("sha256", process.env.OTP_SECRET || "")
    .update(value)
    .digest("base64url");
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
  return crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  if (!process.env.OTP_SECRET) {
    return json(res, 500, {
      error: "OTP_SECRET is not configured on Vercel."
    });
  }

  const {
    action,
    email,
    otp,
    token,
    purpose = "verification"
  } = req.body || {};

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return json(res, 400, {
      error: "A valid email address is required."
    });
  }

  if (action === "send") {
    const code = makeOtp();
    const exp = Date.now() + OTP_TTL_MS;

    const payload = JSON.stringify({
      email: normalizedEmail,
      purpose,
      exp,
      otpHash: hashOtp(code)
    });

    const encoded = b64url(payload);
    const signed = `${encoded}.${sign(encoded)}`;

    const from = process.env.RESEND_FROM_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;

    if (!from || !apiKey) {
      return json(res, 500, {
        error: "Resend environment variables are not configured on Vercel."
      });
    }

    const resendResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          from,
          to: [normalizedEmail],
          subject: "Your AR SKEIL verification OTP",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a1f2e">
              <h2>AR SKEIL Verification</h2>
              <p>Use the OTP below to continue your secure verification.</p>

              <div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px;text-align:center;background:#f7f3e5;border-radius:12px;color:#1a1f2e">
                ${code}
              </div>

              <p style="font-size:12px;color:#777">
                This OTP expires in 10 minutes.
              </p>
            </div>
          `
        })
      }
    );

    const data = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      return json(res, 502, {
        error:
          data?.message ||
          data?.error?.message ||
          "Resend could not send the OTP."
      });
    }

    return json(res, 200, {
      ok: true,
      token: signed,
      expiresAt: exp
    });
  }

  if (action === "verify") {
    if (!token || !otp) {
      return json(res, 400, {
        error: "OTP and verification token are required."
      });
    }

    const [encoded, providedSignature] =
      String(token).split(".");

    if (
      !encoded ||
      !providedSignature ||
      !safeEqual(sign(encoded), providedSignature)
    ) {
      return json(res, 400, {
        error: "Invalid verification token."
      });
    }

    let payload;

    try {
      payload = JSON.parse(unb64url(encoded));
    } catch {
      return json(res, 400, {
        error: "Invalid verification token."
      });
    }

    if (payload.email !== normalizedEmail) {
      return json(res, 400, {
        error: "OTP email does not match."
      });
    }

    if (payload.exp < Date.now()) {
      return json(res, 400, {
        error: "OTP has expired. Please request a new one."
      });
    }

    if (
      !safeEqual(
        hashOtp(String(otp).trim()),
        payload.otpHash
      )
    ) {
      return json(res, 400, {
        error: "Invalid OTP. Please enter the latest code."
      });
    }

    return json(res, 200, {
      ok: true,
      verified: true
    });
  }

  return json(res, 400, {
    error: "Unknown OTP action."
  });
}
