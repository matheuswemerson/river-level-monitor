// Uso: node scripts/hash-password.js <senha>
// Gera o hash para colocar na coluna `senha` da tabela `usuarios`.
import { hashSenha } from "../password.js";

const senha = process.argv[2];
if (!senha) {
  console.error("Uso: node scripts/hash-password.js <senha>");
  process.exit(1);
}
console.log(hashSenha(senha));
