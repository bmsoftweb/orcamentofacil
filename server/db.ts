import 'dotenv/config';
import mysql from 'mysql2/promise';

// Credenciais só pelo ambiente (.env): nunca no código, que vai para o GitHub
for (const nome of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
  if (!process.env[nome]) throw new Error(`${nome} não definido no .env.`);
}

const dbConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'orcamentofacil',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true,
};

export const pool = mysql.createPool(dbConfig);

// O sistema opera no horário de Brasília: NOW(), CURDATE() e os DEFAULT CURRENT_TIMESTAMP
// passam a sair em UTC-3, qualquer que seja o fuso do servidor MySQL.
pool.pool.on('connection', (conn: any) => {
  conn.query("SET time_zone = '-03:00'");
});

export const DB_TABLES = ['usuarios', 'clientes', 'arquitetos', 'materias_primas', 'materiais', 'orcamentos'];

/**
 * Transação com @usuario_id definido: os triggers de historico_precos gravam quem alterou o preço.
 * Use em toda gravação que mexa em preços (catálogo, reajuste em lote).
 */
export async function comUsuario<T>(usuarioId: number | null, fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @usuario_id = ?', [usuarioId]);
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    await conn.query('SET @usuario_id = NULL').catch(() => {});
    conn.release();
  }
}

export async function checkDbHealth() {
  const startTime = Date.now();
  try {
    const conn = await pool.getConnection();
    const [verResult] = await conn.query<any[]>('SELECT VERSION() as version, DATABASE() as db');
    const latency = Date.now() - startTime;

    const counts: Record<string, number> = {};
    for (const t of DB_TABLES) {
      try {
        const [res] = await conn.query<any[]>(`SELECT COUNT(*) as cnt FROM ${t}`);
        counts[t] = res[0]?.cnt ?? 0;
      } catch {
        counts[t] = 0;
      }
    }

    conn.release();

    return {
      connected: true,
      latencyMs: latency,
      version: verResult[0]?.version || 'MySQL 8.0',
      database: verResult[0]?.db || dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      tableCounts: counts,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err.message || 'Falha de conexão com MySQL',
      code: err.code || 'UNKNOWN',
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      tableCounts: {},
    };
  }
}
