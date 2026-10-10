// server.js
import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import cors from "cors";
import crypto from "node:crypto";
import { verificarSenha } from "./password.js";
import { criarToken, verificarToken, temSegredoConfigurado } from "./admin-token.js";

dotenv.config();
const app = express();
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

// === Pool de conexões MySQL ===
// Usamos pool (e não uma conexão única) para o servidor continuar funcionando
// mesmo quando o MySQL derruba conexões ociosas.
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
});

if (!temSegredoConfigurado()) {
  console.warn("⚠️  ADMIN_TOKEN_SECRET não definido no .env: usando segredo temporário (o login do admin expira ao reiniciar o servidor).");
}

try {
  await db.query("SELECT 1");
  console.log("✅ Conectado ao MySQL com sucesso!");
} catch (err) {
  console.error("❌ Erro ao conectar ao MySQL:", err);
}

/* ==============================================
   🔹 Funções auxiliares
   ============================================== */

// Converte para inteiro ou devolve null se não for um inteiro válido
function parseInteiro(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) ? n : null;
}

// Compara textos em tempo constante (evita ataque de timing na chave de API)
function chavesIguais(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Se DEVICE_API_KEY estiver no .env, o ESP32 precisa enviar o header "x-api-key".
// Sem a variável configurada, a rota fica aberta (útil só para testes locais).
function exigirChaveDoDispositivo(req, res, next) {
  const chave = process.env.DEVICE_API_KEY;
  if (!chave) return next();
  if (!chavesIguais(req.get("x-api-key") ?? "", chave)) {
    return res.status(401).json({ error: "Chave de API inválida" });
  }
  next();
}

// Protege as rotas de admin: exige o header "Authorization: Bearer <token>"
// (o token é devolvido pelo /api/login).
function exigirAdmin(req, res, next) {
  const cabecalho = req.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  const dados = verificarToken(token);
  if (!dados) {
    return res.status(401).json({ error: "Não autorizado. Faça login novamente." });
  }
  req.admin = dados.u;
  next();
}

// Valida e normaliza os campos de um local (usado no criar e no editar)
function lerCamposDoLocal(body = {}) {
  const nome = String(body.nome ?? "").trim();
  if (!nome) return { erro: "O campo 'nome' é obrigatório" };

  const vazio = (v) => v === undefined || v === null || v === "";
  if (vazio(body.latitude) || vazio(body.longitude)) {
    return { erro: "Latitude e longitude são obrigatórias" };
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { erro: "Latitude inválida (use um valor entre -90 e 90)" };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { erro: "Longitude inválida (use um valor entre -180 e 180)" };
  }

  let nivelRecomendado = 80; // padrão do banco
  if (!vazio(body.nivel_recomendado)) {
    nivelRecomendado = parseInteiro(body.nivel_recomendado);
    if (nivelRecomendado === null || nivelRecomendado < 0 || nivelRecomendado > 100) {
      return { erro: "Nível recomendado deve ser um inteiro entre 0 e 100" };
    }
  }

  const descricao = body.descricao ?? null;
  const infoDetalhada = body.info_detalhada ?? null;
  const alturaMaxima = String(body.altura_maxima_historica ?? "").trim() || "Não registrado";

  return {
    valores: [nome, descricao, latitude, longitude, nivelRecomendado, infoDetalhada, alturaMaxima],
  };
}

/* ==============================================
   🔹 ROTA: Retorna leituras do dia mais recente (com filtro por local)
   ============================================== */
app.get("/api/leituras", async (req, res) => {
  try {
    // Pega o local_id da query string, ou usa '1' (Tanque Principal) como padrão
    const localId = req.query.local_id || '1';

    // Subquery para encontrar a data mais recente DESTE local
    const subQuery = `(SELECT MAX(DATE(created_at)) FROM leituras WHERE local_id = ?)`;

    const [rows] = await db.execute(
      `SELECT 
          l.id,
          l.nivel,
          loc.nome AS localidade,
          l.created_at,
          DATE(l.created_at) AS data,
          TIME(l.created_at) AS hora
       FROM leituras l
       LEFT JOIN locais loc ON l.local_id = loc.id
       WHERE DATE(l.created_at) = ${subQuery}
       AND l.local_id = ?
       ORDER BY l.created_at DESC`,
      [localId, localId] // Passa o ID duas vezes (para a subquery e para o filtro principal)
    );

    const maximo = rows.length > 0 ? Math.max(...rows.map(r => r.nivel)) : 0;
    res.json({ maximo, leituras: rows });
  } catch (error) {
    console.error("Erro ao buscar leituras:", error);
    res.status(500).json({ error: "Erro ao buscar leituras" });
  }
});

/* ==============================================
   🔹 ROTA: Retorna todas as leituras (com filtro de período)
   ============================================== */
app.get("/api/todas-leituras", async (req, res) => {
  try {
    const localId = req.query.local_id || '1';
    const dias = parseInt(req.query.dias, 10); // Pega o parâmetro 'dias'

    let query = `
      SELECT 
        l.id, l.nivel, loc.nome AS localidade, l.created_at,
        DATE(l.created_at) AS data, TIME(l.created_at) AS hora
      FROM leituras l
      LEFT JOIN locais loc ON l.local_id = loc.id
      WHERE l.local_id = ? 
    `;

    const params = [localId];

    // Se 'dias' for um número válido, adiciona o filtro de data
    if (!isNaN(dias) && dias > 0) {
      query += ` AND l.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) `;
      params.push(dias);
    }

    query += ` ORDER BY l.created_at DESC `;

    const [rows] = await db.execute(query, params);
    res.json(rows);

  } catch (error) {
    console.error("Erro ao buscar histórico:", error);
    res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});

/* ==============================================
   🔹 ROTA: Inserir nova leitura (usada pelo ESP32)
   ============================================== */
app.post("/api/leituras", exigirChaveDoDispositivo, async (req, res) => {
  try {
    const nivel = parseInteiro(req.body?.nivel);
    const localId = parseInteiro(req.body?.local_id);

    if (nivel === null || localId === null) {
      return res.status(400).json({
        error: "Campos 'nivel' e 'local_id' são obrigatórios e devem ser números inteiros",
      });
    }
    if (nivel < 0 || nivel > 100) {
      return res.status(400).json({ error: "'nivel' deve estar entre 0 e 100" });
    }

    const [locais] = await db.execute("SELECT id FROM locais WHERE id = ?", [localId]);
    if (locais.length === 0) {
      return res.status(404).json({ error: "Local não encontrado" });
    }

    const [result] = await db.execute(
      `INSERT INTO leituras (nivel, local_id, created_at)
       VALUES (?, ?, NOW())`,
      [nivel, localId]
    );

    res.json({ ok: true, id: result.insertId, nivel, local_id: localId });
  } catch (error) {
    console.error("Erro ao inserir leitura:", error);
    res.status(500).json({ error: "Erro ao inserir leitura" });
  }
});

/* ==============================================
   🔹 ROTA: Leituras por data específica
   ============================================== */
app.get("/api/leituras/:data", async (req, res) => {
  try {
    const data = req.params.data; // formato YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ error: "Data inválida, use o formato YYYY-MM-DD" });
    }

    const [rows] = await db.execute(
      `SELECT 
          l.id,
          l.nivel,
          loc.nome AS localidade,
          l.created_at,
          DATE(l.created_at) AS data,
          TIME(l.created_at) AS hora
       FROM leituras l
       LEFT JOIN locais loc ON l.local_id = loc.id
       WHERE DATE(l.created_at) = ?
       ORDER BY l.created_at DESC`,
      [data]
    );
    const maximo = rows.length > 0 ? Math.max(...rows.map(r => r.nivel)) : 0;
    res.json({ maximo, leituras: rows });
  } catch (error) {
    console.error("Erro ao buscar leituras por data:", error);
    res.status(500).json({ error: "Erro ao buscar leituras por data" });
  }
});

/* ==============================================
   🔹 ROTA: Retorna todos os locais (com estatísticas)
   ============================================== */
app.get("/api/locais", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
          loc.id,
          loc.nome,
          loc.descricao,
          loc.latitude,
          loc.longitude,
          loc.nivel_recomendado,        
          loc.info_detalhada,           
          loc.altura_maxima_historica,  
          COALESCE(stats.totalRegistros, 0) AS totalRegistros,
          ult.nivel AS ultimoNivel,
          ult.created_at AS dataUltimoNivel
      FROM
          locais loc
      LEFT JOIN (
          -- Subquery para contagem total
          SELECT
              local_id,
              COUNT(*) AS totalRegistros
          FROM
              leituras
          GROUP BY
              local_id
      ) stats ON loc.id = stats.local_id
      LEFT JOIN (
          -- Subquery para encontrar o último nível (baseado no ID mais recente)
          SELECT
              l.local_id,
              l.nivel,
              l.created_at
          FROM
              leituras l
          INNER JOIN (
              SELECT
                  MAX(id) AS max_id
              FROM
                  leituras
              GROUP BY
                  local_id
          ) l_max ON l.id = l_max.max_id
      ) ult ON loc.id = ult.local_id
      ORDER BY
          totalRegistros DESC, loc.nome ASC;
    `);
    res.json(rows);
  } catch (error) {
    console.error("Erro ao buscar locais:", error);
    res.status(500).json({ error: "Erro ao buscar locais" });
  }
});

/* ==============================================
   🔹 ROTA: Retorna alertas ativos (Nível >= 50)
   ============================================== */
const NIVEL_DE_ALERTA = 50;

app.get("/api/alertas-atuais", async (req, res) => {
  try {
    // Último nível de cada local, filtrando só os que estão em alerta
    const [rows] = await db.execute(`
      SELECT
          loc.id,
          loc.nome,
          ult.nivel AS ultimoNivel,
          ult.created_at AS dataUltimoNivel
      FROM
          locais loc
      INNER JOIN (
          -- Subquery para encontrar o último nível (baseado no ID mais recente)
          SELECT
              l.local_id,
              l.nivel,
              l.created_at
          FROM
              leituras l
          INNER JOIN (
              SELECT
                  MAX(id) AS max_id
              FROM
                  leituras
              GROUP BY
                  local_id
          ) l_max ON l.id = l_max.max_id
      ) ult ON loc.id = ult.local_id
      WHERE 
          ult.nivel >= ?
      ORDER BY
          ult.nivel DESC, ult.created_at DESC;
    `, [NIVEL_DE_ALERTA]);
    res.json(rows);
  } catch (error) {
    console.error("Erro ao buscar alertas ativos:", error);
    res.status(500).json({ error: "Erro ao buscar alertas ativos" });
  }
});

/* ==============================================
   🔹 ROTA: Login de Administrador
   ============================================== */
app.post("/api/login", async (req, res) => {
  const { login, senha } = req.body ?? {};
  if (typeof login !== "string" || typeof senha !== "string" || !login || !senha) {
    return res.status(400).json({ ok: false, error: "Informe usuário e senha" });
  }

  try {
    const [rows] = await db.execute("SELECT login, senha FROM usuarios WHERE login = ?", [login]);

    if (rows.length > 0 && verificarSenha(senha, rows[0].senha)) {
      res.json({ ok: true, usuario: rows[0].login, token: criarToken(rows[0].login) });
    } else {
      res.status(401).json({ ok: false, error: "Credenciais inválidas" });
    }
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ==============================================
   🔹 ROTAS CRUD: Gerenciar Locais (Admin)
   ============================================== */

// Criar Local
app.post("/api/admin/locais", exigirAdmin, async (req, res) => {
  const campos = lerCamposDoLocal(req.body);
  if (campos.erro) return res.status(400).json({ error: campos.erro });

  try {
    await db.execute(
      "INSERT INTO locais (nome, descricao, latitude, longitude, nivel_recomendado, info_detalhada, altura_maxima_historica) VALUES (?, ?, ?, ?, ?, ?, ?)",
      campos.valores
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Erro ao criar local:", error);
    res.status(500).json({ error: "Erro ao criar local" });
  }
});

// Editar Local
app.put("/api/admin/locais/:id", exigirAdmin, async (req, res) => {
  const id = parseInteiro(req.params.id);
  if (id === null) return res.status(400).json({ error: "ID inválido" });

  const campos = lerCamposDoLocal(req.body);
  if (campos.erro) return res.status(400).json({ error: campos.erro });

  try {
    const [result] = await db.execute(
      "UPDATE locais SET nome=?, descricao=?, latitude=?, longitude=?, nivel_recomendado=?, info_detalhada=?, altura_maxima_historica=? WHERE id=?",
      [...campos.valores, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Local não encontrado" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Erro ao atualizar local:", error);
    res.status(500).json({ error: "Erro ao atualizar local" });
  }
});

// Deletar Local
app.delete("/api/admin/locais/:id", exigirAdmin, async (req, res) => {
  const id = parseInteiro(req.params.id);
  if (id === null) return res.status(400).json({ error: "ID inválido" });

  // Transação: ou apaga as leituras E o local, ou não apaga nada.
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM leituras WHERE local_id = ?", [id]);
    const [result] = await conn.execute("DELETE FROM locais WHERE id = ?", [id]);
    await conn.commit();

    if (result.affectedRows === 0) return res.status(404).json({ error: "Local não encontrado" });
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    console.error("Erro ao deletar local:", error);
    res.status(500).json({ error: "Erro ao deletar local" });
  } finally {
    conn.release();
  }
});

const PORT = process.env.PORT || 3000;
// '0.0.0.0' permite que o ESP32 (na mesma rede) acesse o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://0.0.0.0:${PORT}`);
});
