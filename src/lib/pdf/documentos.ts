import { brl, cabecalho, data, documento, Empresa, esc, num, pagina, pct, texto } from './comum.js';
import { svgChapa, PlanoDesenho } from './planoSvg.js';

type R = Record<string, any>;
const ROTULO_STATUS: R = { RASCUNHO: 'Rascunho', EM_REVISAO: 'Em revisão', ENVIADO: 'Enviado', APROVADO: 'Aprovado', REPROVADO: 'Reprovado', CANCELADO: 'Cancelado', EXPIRADO: 'Expirado', EM_PRODUCAO: 'Em produção' };
const numeroOrc = (o: R) => `${o.numero}${Number(o.revisao) ? ` rev. ${o.revisao}` : ''}`;
const medidas = (m: R) => (m.largura_mm ? `${num(m.largura_mm, 0)} × ${num(m.altura_mm, 0)} × ${num(m.profundidade_mm, 0)} mm` : '');
/** Móveis agrupados por ambiente (os sem ambiente por último) */
function porAmbiente(ambientes: R[], moveis: R[]) {
  const g = [...ambientes.map((a) => ({ nome: a.nome as string, id: a.id })), { nome: '', id: null }];
  return g.map((a) => ({ ...a, moveis: moveis.filter((m) => (m.ambiente_id ?? null) === a.id) })).filter((a) => a.moveis.length);
}

// ---------------------------------------------------------------------------
// 1. Orçamento para o cliente (sem custos internos)
// ---------------------------------------------------------------------------
export interface DadosCliente {
  empresa: Empresa;
  orcamento: R;
  cliente: R;
  arquiteto: R | null;
  ambientes: R[];
  /** Com acabamento_caixa, acabamento_frente e miniatura (SVG) */
  moveis: R[];
  condicao: R | null;
  parcelas: { rotulo: string; valor: number }[];
  /** Mostrar o valor de cada móvel (rateio do valor final) */
  porMovel: boolean;
}

export function htmlOrcamentoCliente(d: DadosCliente): string {
  const o = d.orcamento;
  const c = d.cliente;
  const enderecoCliente = [c.logradouro && `${c.logradouro}${c.numero ? `, ${c.numero}` : ''}`, c.bairro, c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ''}`].filter(Boolean).join(' · ');
  const blocos = porAmbiente(d.ambientes, d.moveis)
    .map(
      (a) => `${a.nome ? `<h2>${esc(a.nome)}</h2>` : '<h2>Móveis</h2>'}
      <table><tbody>${a.moveis
        .map(
          (m) => `<tr><td style="width:62mm">${m.miniatura ?? ''}</td>
          <td><b style="font-size:11pt">${esc(m.descricao)}</b>${Number(m.quantidade) > 1 ? ` <span class="m">(${m.quantidade} unidades)</span>` : ''}
          ${medidas(m) ? `<div class="m">Medidas externas (L × A × P): ${medidas(m)}</div>` : ''}
          ${m.acabamento_caixa || m.acabamento_frente ? `<div class="m">Acabamento: ${[m.acabamento_caixa && `caixa ${esc(m.acabamento_caixa)}`, m.acabamento_frente && `frente ${esc(m.acabamento_frente)}`].filter(Boolean).join(' · ')}</div>` : ''}
          ${m.observacoes ? `<div class="p">${texto(m.observacoes)}</div>` : ''}</td>
          ${d.porMovel ? `<td class="d" style="width:32mm"><b>${brl(m.valor_venda)}</b></td>` : ''}</tr>`,
        )
        .join('')}</tbody></table>`,
    )
    .join('');
  const corpo = `${cabecalho(d.empresa, `Orçamento ${numeroOrc(o)}`, `${esc(o.titulo)} · emitido em ${data(o.data_emissao)} · válido até ${data(o.data_validade)}`)}
  <div class="grade2">
    <div class="caixa"><b>Cliente</b><br>${esc(c.nome)}${c.cpf_cnpj ? `<br><span class="m">${esc(documento(c.cpf_cnpj))}</span>` : ''}
      ${[c.celular || c.telefone, c.email].filter(Boolean).map((x) => `<br>${esc(x)}`).join('')}${enderecoCliente ? `<br><span class="m">${esc(enderecoCliente)}</span>` : ''}
      ${o.endereco_obra ? `<br>Obra: ${esc(o.endereco_obra)}` : ''}</div>
    <div class="caixa">${d.arquiteto ? `<b>Projeto</b><br>${esc(d.arquiteto.nome)}${d.arquiteto.escritorio ? `<br><span class="m">${esc(d.arquiteto.escritorio)}</span>` : ''}` : '<b>Projeto</b><br><span class="m">—</span>'}
      ${o.prazo_entrega_dias ? `<br><br>Prazo de entrega: <b>${o.prazo_entrega_dias} dias</b>` : ''}</div>
  </div>
  ${blocos}
  <h2>Investimento</h2>
  <table><tbody>
    ${Number(o.valor_desconto) > 0 ? `<tr><td>Valor</td><td class="d">${brl(Number(o.valor_venda_calculado))}</td></tr><tr><td>Desconto</td><td class="d">− ${brl(o.valor_desconto)}</td></tr>` : ''}
    ${Number(o.valor_ajuste_pagamento) ? `<tr><td>${Number(o.valor_ajuste_pagamento) < 0 ? 'Desconto' : 'Acréscimo'} da condição de pagamento</td><td class="d">${brl(Math.abs(Number(o.valor_ajuste_pagamento)))}</td></tr>` : ''}
    <tr><td class="total">Total</td><td class="d total">${brl(o.valor_final)}</td></tr>
  </tbody></table>
  ${d.condicao ? `<h3>Condição de pagamento: ${esc(d.condicao.descricao)}</h3><table style="width:60%"><tbody>${d.parcelas.map((p) => `<tr><td>${esc(p.rotulo)}</td><td class="d">${brl(p.valor)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${o.observacoes ? `<h2>Observações</h2><div>${texto(o.observacoes)}</div>` : ''}
  ${o.condicoes_gerais ? `<h2>Condições gerais</h2><div class="p">${texto(o.condicoes_gerais)}</div>` : ''}`;
  return pagina(`Orçamento ${numeroOrc(o)}`, corpo, { rodape: d.empresa.texto_rodape_orcamento ? texto(d.empresa.texto_rodape_orcamento) : '' });
}

// ---------------------------------------------------------------------------
// 2. Relatório interno (custos, consumos, itens, formação de preço, margem)
// ---------------------------------------------------------------------------
const GRUPOS: [string, string][] = [
  ['custo_chapas', 'Chapas'],
  ['custo_fitas', 'Fitas de borda'],
  ['custo_outras_mp', 'Outras matérias-primas'],
  ['custo_insumos', 'Insumos'],
  ['custo_ferragens', 'Ferragens'],
  ['custo_servicos', 'Serviços'],
  ['custo_avulsos', 'Avulsos'],
];
const TIPO_ITEM: R = { MATERIAL: 'Ferragens', INSUMO: 'Insumos', SERVICO: 'Serviços', MATERIA_PRIMA: 'Outras matérias-primas', AVULSO: 'Avulsos' };
const ORIGEM: R = { IMPORTACAO: 'modelo', REGRA: 'regra', AUTOMATICO: 'automático', MANUAL: 'manual' };

export function htmlRelatorioInterno(d: { empresa: Empresa; orcamento: R; moveis: R[]; consumos: R[]; itens: R[]; nomeMovel: Map<number, string> }): string {
  const o = d.orcamento;
  const total = Number(o.custo_total);
  const custos = GRUPOS.map(([k, r]) => `<tr><td>${r}</td><td class="d">${brl(o[k])}</td><td class="d m">${total ? pct((Number(o[k]) / total) * 100) : ''}</td></tr>`).join('');
  const itensPorTipo = Object.entries(TIPO_ITEM)
    .map(([t, rotulo]) => {
      const l = d.itens.filter((i) => i.tipo_item === t);
      if (!l.length) return '';
      return `<h3>${rotulo}</h3><table><thead><tr><th>Descrição</th><th>Móvel</th><th>Origem</th><th class="d">Qtd</th><th class="c">Un</th><th class="d">Unit.</th><th class="d">Total</th></tr></thead><tbody>
      ${l.map((i) => `<tr><td>${esc(i.descricao)}${i.regra_descricao ? `<div class="p m">${esc(i.regra_descricao)}</div>` : ''}</td><td>${esc(i.movel_id ? d.nomeMovel.get(i.movel_id) ?? '' : 'Geral')}</td><td>${ORIGEM[i.origem] ?? ''}${Number(i.editado_manual) ? ' (editado)' : ''}</td><td class="d">${num(i.quantidade, 4)}</td><td class="c">${esc(i.unidade_sigla)}</td><td class="d">${brl(i.custo_unitario)}</td><td class="d">${brl(i.custo_total)}</td></tr>`).join('')}
      <tr><td colspan="6"><b>Total ${rotulo.toLowerCase()}</b></td><td class="d"><b>${brl(l.reduce((s, i) => s + Number(i.custo_total), 0))}</b></td></tr></tbody></table>`;
    })
    .join('');
  const despesas = ['perc_custo_fixo', 'perc_impostos', 'perc_comissao', 'perc_rt'].reduce((s, k) => s + Number(o[k]), 0);
  const corpo = `${cabecalho(d.empresa, `Relatório interno · ${numeroOrc(o)}`, `${esc(o.titulo)} · ${ROTULO_STATUS[o.status] ?? o.status}${o.calculado_em ? ` · calculado em ${data(o.calculado_em)}` : ''} · uso interno`)}
  <div class="grade2">
    <div><h2>Custos</h2><table><tbody>${custos}<tr><td><b>Custo total</b></td><td class="d"><b>${brl(total)}</b></td><td></td></tr></tbody></table></div>
    <div><h2>Formação de preço</h2><table><tbody>
      <tr><td>Custo fixo / impostos / comissão / RT</td><td class="d">${pct(o.perc_custo_fixo)} / ${pct(o.perc_impostos)} / ${pct(o.perc_comissao)} / ${pct(o.perc_rt)}</td></tr>
      <tr><td>Margem</td><td class="d">${pct(o.perc_margem)}</td></tr>
      <tr><td>Venda calculada (custo ÷ (1 − ${pct(despesas + Number(o.perc_margem))}))</td><td class="d">${brl(o.valor_venda_calculado)}</td></tr>
      <tr><td>Desconto${Number(o.perc_desconto) ? ` (${pct(o.perc_desconto)})` : ''}</td><td class="d">− ${brl(o.valor_desconto)}</td></tr>
      <tr><td>Ajuste da condição de pagamento</td><td class="d">${brl(o.valor_ajuste_pagamento)}</td></tr>
      <tr><td><b>Valor final</b></td><td class="d"><b>${brl(o.valor_final)}</b></td></tr>
      <tr><td>RT do arquiteto</td><td class="d">${brl(o.valor_rt)}</td></tr>
      <tr><td><b>Margem real</b></td><td class="d"><b>${o.margem_real_perc == null ? '—' : pct(o.margem_real_perc)}</b></td></tr>
    </tbody></table></div>
  </div>
  <h2>Consumo de chapas e fitas</h2>
  <table><thead><tr><th>Matéria-prima</th><th class="d">Líquido</th><th class="d">Perda</th><th class="d">Cobrado</th><th class="c">Un</th><th class="d">Aproveitamento</th><th class="d">Unit.</th><th class="d">Total</th></tr></thead><tbody>
  ${d.consumos.map((c) => `<tr><td>${esc(c.descricao)}</td><td class="d">${num(c.quantidade_liquida, 3)} ${c.tipo === 'CHAPA' ? 'm²' : 'm'}</td><td class="d">${pct(c.perc_perda)}</td><td class="d">${num(c.quantidade_cobrada, 3)}</td><td class="c">${esc(c.unidade_sigla)}</td><td class="d">${c.aproveitamento_perc == null ? '' : pct(c.aproveitamento_perc)}</td><td class="d">${brl(c.custo_unitario)}</td><td class="d">${brl(c.custo_total)}</td></tr>`).join('')}
  </tbody></table>
  <h2>Itens</h2>${itensPorTipo || '<p class="m">Sem itens.</p>'}
  <h2>Por móvel</h2>
  <table><thead><tr><th>Móvel</th><th class="d">Qtd</th><th class="d">Chapas</th><th class="d">Fitas</th><th class="d">Ferragens</th><th class="d">Insumos</th><th class="d">Serviços</th><th class="d">Custo</th><th class="d">Venda</th></tr></thead><tbody>
  ${d.moveis.map((m) => `<tr><td>${esc(m.descricao)}</td><td class="d">${m.quantidade}</td><td class="d">${brl(m.custo_chapas)}</td><td class="d">${brl(m.custo_fitas)}</td><td class="d">${brl(m.custo_ferragens)}</td><td class="d">${brl(m.custo_insumos)}</td><td class="d">${brl(m.custo_servicos)}</td><td class="d">${brl(m.custo_total)}</td><td class="d">${brl(m.valor_venda)}</td></tr>`).join('')}
  </tbody></table>`;
  return pagina(`Relatório interno ${numeroOrc(o)}`, corpo);
}

// ---------------------------------------------------------------------------
// 3. Lista de corte (de vw_pecas_corte): PDF por chapa e móvel, e CSV
// ---------------------------------------------------------------------------
const fitas = (l: R) => ['fita_comp1', 'fita_comp2', 'fita_larg1', 'fita_larg2'].map((k) => (l[k] ? esc(l[k]) : '—')).join(' / ');

export function htmlListaCorte(d: { empresa: Empresa; orcamento: R; linhas: R[] }): string {
  const o = d.orcamento;
  const chapas = [...new Set(d.linhas.map((l) => l.chapa_id))];
  const corpo =
    `${cabecalho(d.empresa, `Lista de corte · ${numeroOrc(o)}`, `${esc(o.titulo)} · medidas em mm · comprimento no sentido do veio · fitas C1 / C2 / L1 / L2`)}` +
    chapas
      .map((id) => {
        const l = d.linhas.filter((x) => x.chapa_id === id);
        const moveis = [...new Set(l.map((x) => x.movel_id))];
        const qtd = l.reduce((s, x) => s + Number(x.quantidade_total), 0);
        return `<h2>${esc(l[0].chapa)}${l[0].chapa_codigo ? ` <span class="m">(${esc(l[0].chapa_codigo)})</span>` : ''} · ${qtd} peças</h2>
        ${moveis
          .map((mid) => {
            const pm = l.filter((x) => x.movel_id === mid);
            return `<h3>${esc(pm[0].movel)}</h3><table><thead><tr><th>Peça</th><th>Tipo</th><th class="d">Compr.</th><th class="d">Larg.</th><th class="d">Esp.</th><th class="d">Qtd</th><th class="c">Veio</th><th>Fitas</th><th>Usinagem / obs.</th></tr></thead><tbody>
            ${pm.map((x) => `<tr><td>${esc(x.peca)}</td><td>${esc(x.tipo_peca ?? '')}</td><td class="d">${num(x.comprimento_mm)}</td><td class="d">${num(x.largura_mm)}</td><td class="d">${num(x.espessura_mm)}</td><td class="d">${x.quantidade_total}</td><td class="c">${Number(x.respeita_veio) ? 'sim' : '—'}</td><td class="p">${fitas(x)}</td><td class="p">${esc([x.usinagem, x.observacoes].filter(Boolean).join(' · '))}</td></tr>`).join('')}
            </tbody></table>`;
          })
          .join('')}`;
      })
      .join('');
  return pagina(`Lista de corte ${numeroOrc(o)}`, d.linhas.length ? corpo : `${corpo}<p class="m">Sem peças.</p>`);
}

/** CSV para otimizadores (Corte Certo e afins): separador ";", decimal com vírgula, UTF-8 com BOM */
export function csvListaCorte(linhas: R[]): string {
  const cel = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const dec = (v: unknown) => String(Number(v) || 0).replace('.', ',');
  const cab = ['Chapa', 'Código chapa', 'Móvel', 'Peça', 'Tipo', 'Comprimento', 'Largura', 'Espessura', 'Quantidade', 'Veio', 'Fita C1', 'Fita C2', 'Fita L1', 'Fita L2', 'Usinagem', 'Observações'];
  const corpo = linhas.map((l) =>
    [l.chapa, l.chapa_codigo, l.movel, l.peca, l.tipo_peca, dec(l.comprimento_mm), dec(l.largura_mm), dec(l.espessura_mm), l.quantidade_total, Number(l.respeita_veio) ? 'S' : 'N', l.fita_comp1, l.fita_comp2, l.fita_larg1, l.fita_larg2, l.usinagem, l.observacoes]
      .map(cel)
      .join(';'),
  );
  return `﻿${[cab.join(';'), ...corpo].join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// 4. Plano de corte (o mesmo desenho da tela)
// ---------------------------------------------------------------------------
export function htmlPlanoCorte(d: {
  empresa: Empresa;
  orcamento: R;
  refilo: number;
  kerf: number;
  chapas: { materia_prima_id: number; descricao: string; comprimento: number; largura: number; planos: (PlanoDesenho & R)[] }[];
  pecas: Map<number, { descricao: string; movel_id: number }>;
  cores: Map<number, string[]>;
  moveis: R[];
}): string {
  const o = d.orcamento;
  const total = d.chapas.reduce((s, c) => s + c.planos.length, 0);
  const legenda = d.moveis.map((m) => `<span style="display:inline-block;margin-right:4mm"><span style="display:inline-block;width:3mm;height:3mm;background:${d.cores.get(m.id)?.[0]};border:1px solid ${d.cores.get(m.id)?.[1]}"></span> ${esc(m.descricao)}</span>`).join('');
  let primeira = true;
  const folhas = d.chapas
    .flatMap((c) =>
      c.planos.map((pl) => {
        const quebra = primeira ? '' : 'quebra';
        primeira = false;
        return `<div class="${quebra}" style="page-break-inside:avoid">${quebra ? '' : cabecalho(d.empresa, `Plano de corte · ${numeroOrc(o)}`, `${total} chapas · serra ${num(d.kerf)} mm · refilo ${num(d.refilo)} mm`)}
        <h2>${esc(c.descricao)} · chapa ${pl.numero}/${c.planos.length} <span class="m">· ${pl.pecas.length} peças · aproveitamento ${pct(pl.aproveitamento)}</span></h2>
        <div class="p" style="margin-bottom:2mm">${legenda}</div>
        <div style="height:${quebra ? 140 : 120}mm">${svgChapa(pl, c, d.refilo, d.pecas, d.cores, `${c.materia_prima_id}-${pl.numero}`).replace('width="100%"', 'width="100%" height="100%"')}</div></div>`;
      }),
    )
    .join('');
  return pagina(`Plano de corte ${numeroOrc(o)}`, folhas || `${cabecalho(d.empresa, `Plano de corte · ${numeroOrc(o)}`)}<p class="m">Sem plano: calcule o orçamento.</p>`, { paisagem: true });
}

// ---------------------------------------------------------------------------
// 5. Relatório de RT por arquiteto e período (orçamentos aprovados)
// ---------------------------------------------------------------------------
export function htmlRelatorioRt(d: { empresa: Empresa; inicio: string; fim: string; linhas: R[] }): string {
  const arquitetos = [...new Set(d.linhas.map((l) => l.arquiteto_id))];
  const totalRt = d.linhas.reduce((s, l) => s + Number(l.valor_rt), 0);
  const corpo = `${cabecalho(d.empresa, 'Relatório de RT', `Orçamentos aprovados de ${data(d.inicio)} a ${data(d.fim)}`)}
  ${arquitetos
    .map((a) => {
      const l = d.linhas.filter((x) => x.arquiteto_id === a);
      return `<h2>${esc(l[0].arquiteto_nome)}${l[0].escritorio ? ` <span class="m">· ${esc(l[0].escritorio)}</span>` : ''}${l[0].chave_pix ? ` <span class="m p">· Pix ${esc(l[0].chave_pix)}</span>` : ''}</h2>
      <table><thead><tr><th>Orçamento</th><th>Cliente</th><th class="c">Aprovado em</th><th class="d">Valor final</th><th class="d">RT %</th><th class="d">RT</th></tr></thead><tbody>
      ${l.map((x) => `<tr><td>${esc(numeroOrc(x))}<div class="p m">${esc(x.titulo)}</div></td><td>${esc(x.cliente_nome)}</td><td class="c">${data(x.data_aprovacao)}</td><td class="d">${brl(x.valor_final)}</td><td class="d">${pct(x.perc_rt)}</td><td class="d">${brl(x.valor_rt)}</td></tr>`).join('')}
      <tr><td colspan="3"><b>Total</b></td><td class="d"><b>${brl(l.reduce((s, x) => s + Number(x.valor_final), 0))}</b></td><td></td><td class="d"><b>${brl(l.reduce((s, x) => s + Number(x.valor_rt), 0))}</b></td></tr>
      </tbody></table>`;
    })
    .join('')}
  ${d.linhas.length ? `<p class="total" style="margin-top:6mm">RT total no período: ${brl(totalRt)}</p>` : '<p class="m">Nenhum orçamento aprovado com arquiteto no período.</p>'}`;
  return pagina('Relatório de RT', corpo);
}
