import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool, checkDbHealth } from './db.js';
import { createCrudRouter } from './crud.js';
import { createCatalogoRouter, PASTA_IMAGENS } from './catalogo.js';
import { createImportacoesRouter } from './importacoes.js';
import { createRevisaoRouter } from './revisao.js';
import { createCalculoRouter } from './calculo.js';
import { createOrcamentoEdicaoRouter } from './orcamentoEdicao.js';
import { createDocumentosRouter } from './documentos.js';

// ==========================================================
// Sessão: token "usuarioId.expiracao.assinatura" (HMAC-SHA256)
// ==========================================================
const SEGREDO =
  process.env.SESSION_SECRET ||
  (console.warn('SESSION_SECRET não definido: as sessões expiram a cada reinício do servidor.'),
  crypto.randomBytes(32).toString('hex'));
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

const assinar = (dados: string) => crypto.createHmac('sha256', SEGREDO).update(dados).digest('base64url');

function emitirToken(usuarioId: number): string {
  const dados = `${usuarioId}.${Date.now() + VALIDADE_MS}`;
  return `${dados}.${assinar(dados)}`;
}

/** Id do usuário do token, ou null se inválido/expirado */
function lerToken(token: string): number | null {
  const [id, exp, assinatura] = String(token || '').split('.');
  if (!id || !exp || !assinatura) return null;
  const esperada = assinar(`${id}.${exp}`);
  if (esperada.length !== assinatura.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura))) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

const senhaEmBranco = (hash: unknown) => !hash || String(hash).trim() === '';
const confere = (senha: string, hash: string) => {
  try {
    return bcrypt.compareSync(senha, hash);
  } catch {
    return false;
  }
};

const usuarioPublico = (u: any) => ({ id: String(u.id), nome: u.nome, email: u.email, perfil: u.perfil });

const SQL_USUARIO = 'SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE ativo = 1';

/** Recursos do CRUD genérico que só o administrador acessa */
const SO_ADMIN = ['usuarios', 'configuracoes'];

/** App Express com todas as rotas /api. server.ts adiciona o Vite e o listen */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Login por e-mail + senha
  app.post('/api/login', async (req: Request, res: Response) => {
    try {
      const login = String(req.body?.email || '').trim().toLowerCase();
      const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
      if (!login) return res.status(400).json({ success: false, error: 'Informe o seu e-mail.' });

      const [rows] = await pool.query<any[]>(`${SQL_USUARIO} AND LOWER(TRIM(email)) = ? LIMIT 1`, [login]);
      if (!rows.length) return res.status(401).json({ success: false, error: `O usuário "${login}" não foi localizado ou está inativo.` });
      const u = rows[0];

      // Senha em branco no banco = primeiro acesso: grava o que foi digitado em bcrypt
      let primeiroAcesso = false;
      if (senhaEmBranco(u.senha_hash)) {
        if (senha.trim().length < 4) {
          return res.status(401).json({ success: false, error: 'Primeiro acesso: defina uma senha com pelo menos 4 caracteres.' });
        }
        await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [bcrypt.hashSync(senha, 10), u.id]);
        primeiroAcesso = true;
      } else if (!confere(senha, u.senha_hash)) {
        return res.status(401).json({ success: false, error: 'Senha incorreta para o usuário informado.' });
      }
      await pool.query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [u.id]);

      res.json({
        success: true,
        primeiroAcesso,
        message: primeiroAcesso ? 'Primeiro acesso: sua senha foi registrada.' : undefined,
        token: emitirToken(Number(u.id)),
        usuario: usuarioPublico(u),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Imagens do catálogo: públicas (nome aleatório), para servirem direto no <img>
  app.use('/imagens', express.static(PASTA_IMAGENS, { maxAge: '30d', immutable: true }));

  app.get('/api/db/status', async (_req: Request, res: Response) => {
    res.json(await checkDbHealth());
  });

  // ==========================================================
  // Daqui para baixo, toda rota /api exige um token válido.
  // O usuário é relido a cada requisição: desativado perde o acesso na hora.
  // ==========================================================
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const token = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuarioId = lerToken(token);
    if (!usuarioId) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    try {
      const [rows] = await pool.query<any[]>(`${SQL_USUARIO} AND id = ? LIMIT 1`, [usuarioId]);
      if (!rows.length) return res.status(401).json({ valida: false, error: 'Seu usuário foi desativado. Fale com o administrador.' });
      res.locals.usuarioId = usuarioId;
      res.locals.usuario = rows[0];
      next();
    } catch (err: any) {
      // Falha de banco não derruba a sessão: o painel já mostra o banco como indisponível
      res.status(503).json({ valida: null, error: err.message });
    }
  });

  /** Revalidação da sessão guardada no navegador (a checagem em si é o middleware acima) */
  app.get('/api/sessao', (_req: Request, res: Response) => {
    res.json({ valida: true, usuario: usuarioPublico(res.locals.usuario) });
  });

  /** Troca da própria senha: confere a atual antes */
  app.post('/api/minha-senha', async (req: Request, res: Response) => {
    try {
      const u = res.locals.usuario;
      const { atual, nova } = req.body || {};
      if (!senhaEmBranco(u.senha_hash) && !confere(String(atual ?? ''), u.senha_hash)) return res.status(400).json({ error: 'A senha atual não confere.' });
      if (typeof nova !== 'string' || nova.length < 4) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 4 caracteres.' });
      await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [bcrypt.hashSync(nova, 10), u.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Preferências das listas (larguras e ordem das colunas), por usuário: usuarios.config_listas
  // (database/migrations/002_config_listas.sql). Sem a coluna, as listas usam o padrão.
  app.get('/api/config-listas', async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>('SELECT config_listas FROM usuarios WHERE id = ?', [res.locals.usuarioId]);
      res.json(JSON.parse(rows[0]?.config_listas || '{}') || {});
    } catch {
      res.json({});
    }
  });

  app.put('/api/config-listas', async (req: Request, res: Response) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return res.status(400).json({ error: 'Configuração inválida.' });
    const texto = JSON.stringify(corpo);
    if (texto.length > 60000) return res.status(413).json({ error: 'Configuração muito grande.' });
    try {
      await pool.query('UPDATE usuarios SET config_listas = ? WHERE id = ?', [texto, res.locals.usuarioId]);
      res.json({ success: true });
    } catch (err: any) {
      if (err.code === 'ER_BAD_FIELD_ERROR') return res.status(503).json({ error: 'Rode database/migrations/002_config_listas.sql para gravar as preferências das listas.' });
      res.status(503).json({ error: err.message });
    }
  });

  // Usuários e Configurações: só administradores (o CRUD genérico serve os dois)
  app.use(['/api/crud/:resource', '/api/crud/:resource/:id'], (req: Request, res: Response, next: NextFunction) => {
    if (SO_ADMIN.includes(req.params.resource) && res.locals.usuario.perfil !== 'ADMIN') {
      return res.status(403).json({ error: 'Somente administradores acessam esta opção.' });
    }
    next();
  });

  app.use('/api', createCatalogoRouter());
  app.use('/api', createImportacoesRouter());
  app.use('/api', createRevisaoRouter());
  app.use('/api', createCalculoRouter());
  app.use('/api', createOrcamentoEdicaoRouter());
  app.use('/api', createDocumentosRouter());
  app.use('/api', createCrudRouter());

  return app;
}
