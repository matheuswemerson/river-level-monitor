// admin-token.js
// Token de sessão assinado (HMAC-SHA256), sem dependências externas.
// Formato: <payload em base64url>.<assinatura em base64url>
import crypto from "node:crypto";

let segredoTemporario;

// Lê o segredo só na hora de usar (o dotenv é carregado depois dos imports).
function segredo() {
  if (process.env.ADMIN_TOKEN_SECRET) return process.env.ADMIN_TOKEN_SECRET;
  // Sem segredo no .env: gera um temporário (as sessões caem quando o servidor reinicia)
  segredoTemporario ??= crypto.randomBytes(32).toString("hex");
  return segredoTemporario;
}

export function temSegredoConfigurado() {
  return Boolean(process.env.ADMIN_TOKEN_SECRET);
}

function assinar(payload) {
  return crypto.createHmac("sha256", segredo()).update(payload).digest();
}

export function criarToken(usuario, duracaoMs = 8 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({ u: usuario, exp: Date.now() + duracaoMs })).toString("base64url");
  return `${payload}.${assinar(payload).toString("base64url")}`;
}

// Devolve { u, exp } se o token for válido e não expirou; senão, null.
export function verificarToken(token) {
  const [payload, assinatura] = String(token ?? "").split(".");
  if (!payload || !assinatura) return null;

  const esperada = assinar(payload);
  const recebida = Buffer.from(assinatura, "base64url");
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;

  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof dados.exp !== "number" || dados.exp < Date.now()) return null;
    return dados;
  } catch {
    return null;
  }
}
