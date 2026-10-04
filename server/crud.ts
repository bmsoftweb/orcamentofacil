import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool, comUsuario } from './db.js';
import { FieldDef, ResourceDef, RESOURCES, getResource, writableFields, columnNames, colunaSql } from './schema.js';
import { antesDeGravar, antesDeExcluir, aposIncluir } from './regras.js';
import { documentoValido } from '../src/lib/documento.js';

/** Metadados enviados ao navegador: o SQL próprio (combos, colunas calculadas) não sai do servidor */
const RESOURCES_PUBLICOS = RESOURCES.map(({ optionsSql, scopeSql, ...r }) => ({ ...r, fields: r.fields.map(({ sql, ...f }) => f) }));

/** Data de hoje no horário local (Brasília), aaaa-mm-dd */
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Converte o valor recebido do formulário para o tipo esperado pela coluna do MySQL */
function coerceValue(field: FieldDef, raw: any): any {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') {
    // Campos obrigatórios em branco viram string vazia; opcionais viram NULL
    return field.required && (field.type === 'text' || field.type === 'cnpj') ? '' : null;
  }

  switch (field.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'decimal': {
      // Texto, para o MySQL receber o valor exato (sem passar por float)
      const t = String(raw).trim().replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
    }
    case 'boolean':
      return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
    case 'cnpj': {
      const d = String(raw).replace(/\D/g, '');
      if (!d) return null;
      if (!documentoValido(d)) throw new Error(`${field.label} inválido: confira os dígitos.`);
      return d;
    }
    case 'cep': {
      const d = String(raw).replace(/\D/g, '');
      if (!d) return null;
      if (d.length !== 8) throw new Error('CEP inválido: são 8 dígitos.');
      return `${d.slice(0, 5)}-${d.slice(5)}`;
    }
    case 'cor': {
      const cor = String(raw).trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(cor)) throw new Error(`O campo "${field.label}" precisa ser uma cor (#RRGGBB).`);
      return cor;
    }
    case 'imagem': {
      const caminho = String(raw);
      if (!/^\/imagens\/[\w-]+\.(jpg|png|webp)$/.test(caminho)) throw new Error(`Imagem inválida em "${field.label}".`);
      return caminho;
    }
    case 'date':
      return String(raw).slice(0, 10);
    case 'datetime':
      return String(raw).replace('T', ' ').slice(0, 19);
    case 'time': {
      const t = String(raw).slice(0, 8);
      return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
    }
    default:
      return String(raw);
  }
}

/** Monta o payload de gravação a partir do corpo da requisição, aplicando a whitelist de colunas */
function buildWritePayload(resource: ResourceDef, body: Record<string, any>, isUpdate: boolean): Record<string, any> {
  const payload: Record<string, any> = {};

  for (const field of writableFields(resource)) {
    if (!(field.name in body)) continue;

    // Senha: texto puro informado é convertido em bcrypt; em branco mantém a senha atual
    if (field.type === 'password') {
      const plain = String(body[field.name] ?? '');
      if (plain.trim() === '') {
        if (!isUpdate) payload[field.name] = '';
        continue;
      }
      payload[field.name] = bcrypt.hashSync(plain, 10);
      continue;
    }

    payload[field.name] = coerceValue(field, body[field.name]);
  }

  // Campo que só vale com certo valor de outro (ex.: dimensões da chapa): fora dele grava NULL
  for (const field of writableFields(resource)) {
    const q = field.quando;
    if (q && q.campo in payload && !q.valores.includes(String(payload[q.campo] ?? ''))) payload[field.name] = null;
  }

  return payload;
}

/** Valida os campos obrigatórios antes de tocar no banco, para devolver mensagem amigável */
function validateRequired(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  const faltando: string[] = [];
  for (const field of writableFields(resource)) {
    const oq = field.obrigatorioQuando;
    const exigido = field.required || (oq && oq.valores.includes(String(payload[oq.campo] ?? '')));
    if (!exigido || field.type === 'password') continue;
    if (isUpdate && !(field.name in payload)) continue;
    const value = payload[field.name];
    if (value === null || value === undefined || value === '') faltando.push(field.label);
  }
  if (faltando.length) throw new Error(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
}

/** Traduz erros do MySQL para mensagens legíveis ao operador */
export function friendlyDbError(err: any, labelSingular = 'registro'): string {
  switch (err?.code) {
    case 'ER_DUP_ENTRY':
      return `Já existe um registro de ${labelSingular} com esse valor único (${err.sqlMessage?.match(/for key '(.+?)'/)?.[1] || 'chave duplicada'}).`;
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return `Não é possível excluir (${labelSingular}): existem registros vinculados. Inative o cadastro em vez de excluir.`;
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return 'Um dos vínculos informados não existe. Verifique os campos de seleção.';
    case 'ER_DATA_TOO_LONG':
      return `Um dos campos excedeu o tamanho permitido: ${err.sqlMessage || ''}`;
    case 'ER_BAD_NULL_ERROR':
      return `Um campo obrigatório ficou em branco: ${err.sqlMessage || ''}`;
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return `Valor fora do permitido: ${err.sqlMessage || ''}`;
    case 'WARN_DATA_TRUNCATED':
      return 'Um dos valores selecionados não é aceito por esta coluna. Verifique os campos de seleção.';
    default:
      return err?.sqlMessage || err?.message || 'Erro inesperado ao acessar o banco de dados.';
  }
}

export function createCrudRouter() {
  const router = Router();

  function resolveResource(req: Request): ResourceDef {
    const resource = getResource(req.params.resource);
    if (!resource) throw new Error(`Recurso "${req.params.resource}" não existe.`);
    return resource;
  }

  const pkCol = (resource: ResourceDef) => resource.pk[0];
  const escopo = (resource: ResourceDef) => resource.scopeSql || '1 = 1';

  router.get('/meta/resources', (_req: Request, res: Response) => {
    res.json(RESOURCES_PUBLICOS);
  });

  // Opções de chave estrangeira (combos dos formulários)
  router.get('/options/:resource', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req);
      const labelField = String(req.query.label_field || resource.labelField);
      if (!columnNames(resource).includes(labelField) || resource.fields.find((f) => f.name === labelField)?.sql) {
        throw new Error(`Campo de rótulo "${labelField}" inválido.`);
      }
      // Combo filtrado por uma coluna do recurso (metadado refFiltro: categoria do módulo, chapa × fita)
      const filtroCampo = String(req.query.filtro_campo || '');
      const filtrado = filtroCampo && columnNames(resource).includes(filtroCampo);
      const sql =
        (labelField === resource.labelField && !filtrado && resource.optionsSql) ||
        `SELECT t.${pkCol(resource)} AS value, t.${labelField} AS label
           FROM ${resource.table} t
          WHERE ${escopo(resource)}${filtrado ? ` AND t.${filtroCampo} = ?` : ''}
          ORDER BY t.${labelField} ASC
          LIMIT 5000`; // ponytail: o combo filtra no navegador; passando disso, buscar no servidor
      const [rows] = await pool.query<any[]>(sql, filtrado ? [String(req.query.filtro_valor ?? '')] : []);
      res.json(rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) })));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Listagem paginada com busca, filtros e ordenação
  router.get('/crud/:resource', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const sortField = columnNames(resource).includes(String(req.query.sort)) ? String(req.query.sort) : resource.defaultSort.field;
      const dirQ = String(req.query.dir).toLowerCase();
      const sortDir = dirQ === 'asc' ? 'ASC' : dirQ === 'desc' ? 'DESC' : resource.defaultSort.dir.toUpperCase();

      const where: string[] = [escopo(resource)];
      const params: any[] = [];

      // Busca textual nos campos marcados como searchable
      const search = String(req.query.search || '').trim();
      const searchable = resource.fields.filter((f) => f.searchable);
      if (search && searchable.length) {
        where.push(`(${searchable.map((f) => `${colunaSql(resource, f.name)} LIKE ?`).join(' OR ')})`);
        searchable.forEach(() => params.push(`%${search}%`));
      }

      // Filtro exato por coluna (painel mestre-detalhe): ?filter_field=x&filter_value=...
      const filterField = String(req.query.filter_field || '');
      const filterValue = req.query.filter_value;
      if (filterField && filterValue !== undefined && filterValue !== '' && columnNames(resource).includes(filterField)) {
        where.push(`${colunaSql(resource, filterField)} = ?`);
        params.push(filterValue);
      }

      // Busca avançada: ?filters=[{"field":"perfil","op":"eq","value":"ADMIN"}]
      // Coluna e operador passam por whitelist; o valor vai sempre como parâmetro.
      const filtersRaw = String(req.query.filters || '').trim();
      if (filtersRaw) {
        let parsed: any[];
        try {
          parsed = JSON.parse(filtersRaw);
        } catch {
          throw new Error('Parâmetro "filters" não contém um JSON válido.');
        }
        if (!Array.isArray(parsed)) throw new Error('Parâmetro "filters" deve ser uma lista.');
        if (parsed.length > 20) throw new Error('São aceitos no máximo 20 filtros por consulta.');

        const colunas = columnNames(resource);
        const ops: Record<string, string> = { eq: '=', ne: '<>', gte: '>=', lte: '<=' };
        for (const f of parsed) {
          const campo = String(f?.field || '');
          const op = String(f?.op || '');
          const valor = f?.value;
          if (!colunas.includes(campo)) throw new Error(`Filtro inválido: a coluna "${campo}" não existe em ${resource.label}.`);
          // Filtrar por hash de senha (LIKE '%a%', '%ab%'...) permitiria reconstruí-lo aos poucos
          if (resource.fields.find((d) => d.name === campo)?.type === 'password') {
            throw new Error(`Filtro inválido: a coluna "${campo}" não pode ser pesquisada.`);
          }
          if (valor === undefined || valor === null || valor === '') continue;
          if (op === 'contains') {
            where.push(`${colunaSql(resource, campo)} LIKE ?`);
            params.push(`%${valor}%`);
          } else if (ops[op]) {
            where.push(`${colunaSql(resource, campo)} ${ops[op]} ?`);
            params.push(valor);
          } else {
            throw new Error(`Filtro inválido: operador "${op}" não é suportado.`);
          }
        }
      }

      const whereSql = where.join(' AND ');
      const [countRows] = await pool.query<any[]>(`SELECT COUNT(*) AS total FROM ${resource.table} t WHERE ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);

      const calculadas = resource.fields.filter((f) => f.sql);
      // Nome do registro ligado (<campo>__rotulo): a lista mostra mesmo quando passa do limite dos combos
      const rotulos = resource.fields.flatMap((f) => {
        const ref = f.ref && !f.sql ? getResource(f.ref.resource) : null;
        const campo = ref?.fields.find((x) => x.name === f.ref!.labelField);
        if (!ref || !campo || campo.sql) return [];
        return [`, (SELECT r.${campo.name} FROM ${ref.table} r WHERE r.${pkCol(ref)} = t.${f.name} LIMIT 1) AS ${f.name}__rotulo`];
      });
      // A senha nunca sai do servidor, nem em hash
      const senhas = resource.fields.filter((f) => f.type === 'password').map((f) => f.name);
      // Campo ligado: ordena pelo nome do registro ligado, os vazios no fim
      const ordenaRotulo = rotulos.some((r) => r.endsWith(` AS ${sortField}__rotulo`));
      const ordem = ordenaRotulo
        ? `(t.${sortField} IS NULL), ${sortField}__rotulo ${sortDir}, t.${resource.labelField} ASC`
        : `${calculadas.some((f) => f.name === sortField) ? sortField : `t.${sortField}`} ${sortDir}`;
      const [rows] = await pool.query<any[]>(
        `SELECT t.*${calculadas.map((f) => `, ${f.sql} AS ${f.name}`).join('')}${rotulos.join('')} FROM ${resource.table} t
          WHERE ${whereSql}
          ORDER BY ${ordem}, t.${pkCol(resource)} ${sortDir}
          LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      for (const r of rows) for (const s of senhas) r[s] = r[s] ? '********' : '';

      res.json({ data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.get('/crud/:resource/:id', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req);
      const [rows] = await pool.query<any[]>(
        `SELECT t.* FROM ${resource.table} t WHERE ${escopo(resource)} AND t.${pkCol(resource)} = ? LIMIT 1`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      for (const f of resource.fields) if (f.type === 'password') rows[0][f.name] = '';
      res.json(rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/crud/:resource', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req);
      if (!resource.canCreate) return res.status(403).json({ error: `Não é permitido incluir registros em ${resource.label}.` });

      const payload = buildWritePayload(resource, req.body || {}, false);
      validateRequired(resource, payload, false);
      await antesDeGravar(resource.name, payload, null, Number(res.locals.usuarioId));
      if (resource.preco?.data && payload[resource.preco.campo] != null) payload[resource.preco.data] = hoje();

      const cols = Object.keys(payload);
      const [result] = await comUsuario(res.locals.usuarioId, (conn) =>
        conn.query<any>(`INSERT INTO ${resource!.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => payload[c])),
      );
      await aposIncluir(resource.name, String(result.insertId), Number(res.locals.usuarioId));
      res.json({ success: true, id: String(result.insertId) });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  router.put('/crud/:resource/:id', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req);
      if (!resource.canUpdate) return res.status(403).json({ error: `Não é permitido alterar registros em ${resource.label}.` });

      const payload = buildWritePayload(resource, req.body || {}, true);
      validateRequired(resource, payload, true);
      const cols = Object.keys(payload);
      if (!cols.length) return res.status(400).json({ error: 'Nenhuma alteração foi informada.' });
      await antesDeGravar(resource.name, payload, req.params.id, Number(res.locals.usuarioId));

      // Custo mudou: a data do último preço vai antes no SET (o MySQL avalia da esquerda para a direita,
      // então compara com o custo ainda antigo). O trigger grava o histórico com @usuario_id.
      const p = resource.preco;
      const dataPreco = p?.data && p.campo in payload ? `t.${p.data} = IF(t.${p.campo} <> ?, CURDATE(), t.${p.data}), ` : '';
      const [result] = await comUsuario(res.locals.usuarioId, (conn) =>
        conn.query<any>(
          `UPDATE ${resource!.table} t SET ${dataPreco}${cols.map((c) => `t.${c} = ?`).join(', ')}
            WHERE ${escopo(resource!)} AND t.${pkCol(resource!)} = ?`,
          [...(dataPreco ? [payload[p!.campo]] : []), ...cols.map((c) => payload[c]), req.params.id],
        ),
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  router.delete('/crud/:resource/:id', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req);
      if (!resource.canDelete) return res.status(403).json({ error: `Não é permitido excluir registros em ${resource.label}.` });
      await antesDeExcluir(resource.name, req.params.id);
      const [result] = await pool.query<any>(
        `DELETE t FROM ${resource.table} t WHERE ${escopo(resource)} AND t.${pkCol(resource)} = ?`,
        [req.params.id],
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  return router;
}
