/** Peças comuns dos documentos impressos (HTML que o servidor converte em PDF) */

/** Escapa texto vindo do banco antes de entrar no HTML */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BRL_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: unknown) => BRL_FMT.format(Number(v) || 0);
export const num = (v: unknown, casas = 1) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(Number(v) || 0);
export const pct = (v: unknown) => `${num(v, 2)}%`;
/** aaaa-mm-dd[ hh:mm] → dd/mm/aaaa */
export const data = (v: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
/** Texto com quebras de linha preservadas */
export const texto = (v: unknown) => esc(v).replace(/\n/g, '<br>');

export interface Empresa {
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  /** Logo já embutida (data URI) */
  logo?: string | null;
  texto_rodape_orcamento?: string | null;
}

const doc = (d: string | null | undefined) => {
  const x = String(d ?? '').replace(/\D/g, '');
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return x;
};
export const documento = doc;

/** Página A4 com o estilo base; `paisagem` para o plano de corte */
export function pagina(titulo: string, corpo: string, opcoes: { paisagem?: boolean; rodape?: string } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page { size: A4 ${opcoes.paisagem ? 'landscape' : 'portrait'}; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1c1917; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 2mm; } h2 { font-size: 11.5pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid #d6d3d1; }
h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; }
table { width: 100%; border-collapse: collapse; } th, td { padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
thead th { font-size: 8.5pt; color: #57534e; border-bottom: 1px solid #a8a29e; } tbody tr { border-bottom: 1px solid #e7e5e4; page-break-inside: avoid; }
.d { text-align: right; } .c { text-align: center; } .m { color: #57534e; } .p { font-size: 8.5pt; }
.topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; border-bottom: 2px solid #1c1917; padding-bottom: 3mm; margin-bottom: 4mm; }
.topo img { max-height: 18mm; max-width: 55mm; } .empresa { font-size: 8.5pt; color: #44403c; text-align: right; }
.caixa { border: 1px solid #d6d3d1; border-radius: 2mm; padding: 2.5mm 3mm; }
.grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.total { font-size: 13pt; font-weight: 700; } .rodape { margin-top: 8mm; font-size: 8.5pt; color: #57534e; }
.quebra { page-break-before: always; }
</style></head><body>${corpo}${opcoes.rodape ? `<div class="rodape">${opcoes.rodape}</div>` : ''}</body></html>`;
}

/** Cabeçalho: logo/nome à esquerda, dados da empresa à direita */
export function cabecalho(e: Empresa, titulo: string, sub = '') {
  const end = [e.logradouro && `${e.logradouro}${e.numero ? `, ${e.numero}` : ''}`, e.bairro, e.cidade && `${e.cidade}${e.uf ? `/${e.uf}` : ''}`, e.cep]
    .filter(Boolean)
    .join(' · ');
  return `<div class="topo"><div>${e.logo ? `<img src="${e.logo}" alt="">` : `<div style="font-size:14pt;font-weight:700">${esc(e.nome_fantasia || e.razao_social)}</div>`}
  <h1 style="margin-top:3mm">${esc(titulo)}</h1>${sub ? `<div class="m">${sub}</div>` : ''}</div>
  <div class="empresa"><b>${esc(e.razao_social)}</b>${e.cnpj ? `<br>CNPJ ${esc(doc(e.cnpj))}` : ''}${end ? `<br>${esc(end)}` : ''}
  ${[e.telefone, e.email, e.site].filter(Boolean).map((x) => `<br>${esc(x)}`).join('')}</div></div>`;
}
