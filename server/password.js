// password.js
// Hash de senha usando scrypt (já vem no Node.js, não precisa instalar nada).
// Formato guardado no banco: scrypt$<salt>$<hash>
import crypto from "node:crypto";

const TAMANHO_HASH = 64;

export function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(senha), salt, TAMANHO_HASH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verificarSenha(senha, armazenado) {
  const [algoritmo, salt, hash] = String(armazenado ?? "").split("$");
  if (algoritmo !== "scrypt" || !salt || !hash) return false;

  const esperado = Buffer.from(hash, "hex");
  const calculado = crypto.scryptSync(String(senha), salt, esperado.length);
  return crypto.timingSafeEqual(calculado, esperado);
}
