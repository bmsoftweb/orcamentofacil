/**
 * Gera arquivos .dae sintéticos (como o SketchUp exporta: polegadas, Z_UP, raiz "SketchUp"),
 * sem depender de arquivos reais. Os testes usam `fixtures()` direto; rodar este arquivo grava os .dae
 * nesta pasta para abrir no visualizador ou no SketchUp:
 *
 *   npx tsx tests/fixtures/dae/gerar-fixtures.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const POL = 25.4; // mm por polegada
type V3 = [number, number, number];
type Modo = 'triangles' | 'polylist' | 'polygons';

interface Caixa {
  /** Medidas em mm (x, y, z) */
  dims: V3;
  /** Canto mínimo em mm, no espaço do nó */
  origem?: V3;
  /** Geometria desenhada girada (graus em Z) dentro do grupo */
  rotZ?: number;
  material: string;
}

interface No {
  nome: string;
  /** Matriz 4×4 em linhas (convenção COLLADA), translação em mm (convertida para polegadas) */
  matriz?: number[];
  caixa?: Caixa;
  filhos?: No[];
  /** Instância de um componente de library_nodes (id da definição) */
  instancia?: string;
}

interface Definicao {
  id: string;
  nome: string;
  no: No;
}

/** Translação em mm, como matriz em linhas */
export const mover = (x: number, y: number, z: number) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
/** Rotação em Z (graus) seguida de translação (mm) */
export const girarZ = (graus: number, x = 0, y = 0, z = 0) => {
  const r = (graus * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e9) / 1e9;
  const s = Math.round(Math.sin(r) * 1e9) / 1e9;
  return [c, -s, 0, x, s, c, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
};
/** Espelho em X (escala -1) com translação */
export const espelharX = (x = 0, y = 0, z = 0) => [-1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];

const CORES: Record<string, string> = { 'MDF Branco TX': '0.95 0.95 0.93 1', Inox: '0.7 0.7 0.72 1', Pele: '0.85 0.7 0.6 1' };

/** Monta o XML COLLADA a partir da árvore de nós */
export function montarDae(raiz: No[], defs: Definicao[] = [], modo: Modo = 'triangles'): string {
  const geos: string[] = [];
  const materiais = new Set<string>();
  let n = 0;

  const geometria = (c: Caixa) => {
    const id = `G${++n}`;
    materiais.add(c.material);
    const [dx, dy, dz] = c.dims;
    const [ox, oy, oz] = c.origem ?? [0, 0, 0];
    const r = ((c.rotZ ?? 0) * Math.PI) / 180;
    const pts: V3[] = [];
    for (const [x, y, z] of [[0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0], [0, 0, dz], [dx, 0, dz], [dx, dy, dz], [0, dy, dz]] as V3[]) {
      const xr = x * Math.cos(r) - y * Math.sin(r);
      const yr = x * Math.sin(r) + y * Math.cos(r);
      pts.push([(xr + ox) / POL, (yr + oy) / POL, (z + oz) / POL]);
    }
    // 6 faces com normal para fora (anti-horário visto de fora)
    const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
    const posicoes = pts.map((p) => p.map((v) => +v.toFixed(6)).join(' ')).join(' ');
    const sym = `M${[...materiais].indexOf(c.material)}`;
    const entrada = `<input semantic="VERTEX" source="#${id}-v" offset="0"/>`;
    let prim: string;
    if (modo === 'polylist') {
      prim = `<polylist count="6" material="${sym}">${entrada}<vcount>4 4 4 4 4 4</vcount><p>${quads.flat().join(' ')}</p></polylist>`;
    } else if (modo === 'polygons') {
      prim = `<polygons count="6" material="${sym}">${entrada}${quads.map((q) => `<p>${q.join(' ')}</p>`).join('')}</polygons>`;
    } else {
      const tris = quads.flatMap(([a, b, c2, d]) => [a, b, c2, a, c2, d]);
      prim = `<triangles count="12" material="${sym}">${entrada}<p>${tris.join(' ')}</p></triangles>`;
    }
    geos.push(
      `<geometry id="${id}"><mesh><source id="${id}-p"><float_array id="${id}-a" count="24">${posicoes}</float_array>` +
        `<technique_common><accessor source="#${id}-a" count="8" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>` +
        `<vertices id="${id}-v"><input semantic="POSITION" source="#${id}-p"/></vertices>${prim}<lines count="1"><input semantic="VERTEX" source="#${id}-v" offset="0"/><p>0 1</p></lines></mesh></geometry>`,
    );
    return `<instance_geometry url="#${id}"><bind_material><technique_common><instance_material symbol="${sym}" target="#MAT${[...materiais].indexOf(c.material)}"/></technique_common></bind_material></instance_geometry>`;
  };

  const no = (x: No, id?: string): string => {
    const m = x.matriz ? `<matrix>${x.matriz.map((v, i) => ([3, 7, 11].includes(i) ? v / POL : v)).join(' ')}</matrix>` : '';
    const g = x.caixa ? geometria(x.caixa) : '';
    const inst = x.instancia ? `<instance_node url="#${x.instancia}"/>` : '';
    return `<node${id ? ` id="${id}"` : ''} name="${x.nome}">${m}${g}${inst}${(x.filhos ?? []).map((f) => no(f)).join('')}</node>`;
  };

  const nos = raiz.map((r) => no(r)).join('');
  const biblioteca = defs.map((d) => no({ ...d.no, nome: d.nome }, d.id)).join('');
  const lista = [...materiais];
  return `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>Gerador de fixtures OrçamentoFácil</authoring_tool></contributor><unit meter="0.0254" name="inch"/><up_axis>Z_UP</up_axis></asset>
<library_cameras><camera id="CAM" name="camera"><optics><technique_common><perspective><yfov>35</yfov><znear>1</znear><zfar>1000</zfar></perspective></technique_common></optics></camera></library_cameras>
<library_visual_scenes><visual_scene id="CENA"><node name="SketchUp"><node name="camera"><matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</matrix><instance_camera url="#CAM"/></node>${nos}</node></visual_scene></library_visual_scenes>
<library_nodes>${biblioteca}</library_nodes>
<library_geometries>${geos.join('')}</library_geometries>
<library_materials>${lista.map((m, i) => `<material id="MAT${i}" name="${m}"><instance_effect url="#EF${i}"/></material>`).join('')}</library_materials>
<library_effects>${lista.map((m, i) => `<effect id="EF${i}"><profile_COMMON><technique sid="COMMON"><lambert><diffuse><color>${CORES[m] ?? '0.5 0.5 0.5 1'}</color></diffuse></lambert></technique></profile_COMMON></effect>`).join('')}</library_effects>
<scene><instance_visual_scene url="#CENA"/></scene>
</COLLADA>`;
}

// ---------------------------------------------------------------------------
// Armário simples 800 (L) × 700 (A) × 350 (P), MDF 18, fundo 6, frente em y negativo
// ---------------------------------------------------------------------------
const MDF = 'MDF Branco TX';
const chapa = (dims: V3): Caixa => ({ dims, material: MDF });
const PUXADOR: Definicao = { id: 'DEF_PUX', nome: 'Puxador 160', no: { nome: 'Puxador 160', caixa: { dims: [160, 25, 20], material: 'Inox' } } };
const PORTA: Definicao = { id: 'DEF_PORTA', nome: 'Porta 400x700', no: { nome: 'Porta 400x700', caixa: chapa([400, 18, 700]) } };

function pecasCaixa(): No[] {
  return [
    { nome: 'Lateral Esquerda', matriz: mover(0, 0, 0), caixa: chapa([18, 350, 700]) },
    { nome: 'Lateral Direita', matriz: mover(782, 0, 0), caixa: chapa([18, 350, 700]) },
    { nome: 'Base', matriz: mover(18, 0, 0), caixa: chapa([764, 350, 18]) },
    { nome: 'Tampo', matriz: mover(18, 0, 682), caixa: chapa([764, 350, 18]) },
    { nome: 'Fundo', matriz: mover(18, 344, 18), caixa: chapa([764, 6, 664]) },
    { nome: 'Prateleira', matriz: mover(18, 0, 341), caixa: chapa([764, 330, 18]) },
  ];
}
const puxadores = (): No[] => [
  { nome: 'instance_1', matriz: mover(370, -43, 300), instancia: PUXADOR.id },
  { nome: 'instance_2', matriz: mover(410, -43, 300), instancia: PUXADOR.id },
];

export function fixtures(): Record<string, string> {
  return {
    // 1. Armário com 2 laterais, base, tampo, fundo 6 mm, prateleira, 2 portas e 2 puxadores (componente)
    '01-armario-simples': montarDae(
      [
        {
          nome: 'Armario',
          filhos: [
            ...pecasCaixa(),
            { nome: 'Porta Esquerda', matriz: mover(0, -18, 0), caixa: chapa([400, 18, 700]) },
            { nome: 'Porta Direita', matriz: mover(400, -18, 0), caixa: chapa([400, 18, 700]) },
            ...puxadores(),
          ],
        },
      ],
      [PUXADOR],
    ),
    // 2. O mesmo armário com as portas como uma definição instanciada 2×
    '02-armario-componentes': montarDae(
      [
        {
          nome: 'Armario',
          filhos: [
            ...pecasCaixa(),
            { nome: 'instance_3', matriz: mover(0, -18, 0), instancia: PORTA.id },
            { nome: 'instance_4', matriz: mover(400, -18, 0), instancia: PORTA.id },
            ...puxadores(),
          ],
        },
      ],
      [PUXADOR, PORTA],
    ),
    // 3. Porta girada 90° e lateral espelhada (escala -1)
    '03-girada-espelhada': montarDae([
      {
        nome: 'Armario',
        filhos: [
          { nome: 'Porta Lateral', matriz: girarZ(90, 818, 0, 0), caixa: chapa([400, 18, 700]) },
          { nome: 'Lateral Espelhada', matriz: espelharX(18, 0, 0), caixa: chapa([18, 350, 700]) },
        ],
      },
    ]),
    // 4. Peça desenhada girada (30°) dentro de um grupo sem rotação: tentativa 2 da caixa orientada
    '04-geometria-girada': montarDae([
      { nome: 'Painel', filhos: [{ nome: 'Prateleira Girada', caixa: { dims: [600, 300, 18], rotZ: 30, origem: [100, 50, 0], material: MDF } }] },
    ]),
    // 5. Grupos aninhados em 3 níveis e um "Humano escala" a ignorar
    '05-aninhados-humano': montarDae(
      [
        {
          nome: 'Estante',
          filhos: [
            {
              nome: 'Modulo',
              matriz: mover(0, 0, 100),
              filhos: [
                {
                  nome: 'Nicho',
                  matriz: mover(0, 0, 200),
                  filhos: [
                    { nome: 'Lateral Nicho', caixa: chapa([18, 300, 400]) },
                    { nome: 'Base Nicho', matriz: mover(18, 0, 0), caixa: chapa([500, 300, 18]) },
                  ],
                },
              ],
            },
          ],
        },
        { nome: 'instance_9', matriz: mover(1500, 0, 0), instancia: 'DEF_HUMANO' },
      ],
      [{ id: 'DEF_HUMANO', nome: 'Humano escala', no: { nome: 'Humano escala', caixa: { dims: [450, 250, 1750], material: 'Pele' } } }],
    ),
    // 6. Mesmo armário com <polylist> e com <polygons> (o 01 usa <triangles>)
    '06-polylist': montarDae([{ nome: 'Armario', filhos: pecasCaixa() }], [], 'polylist'),
    '06-polygons': montarDae([{ nome: 'Armario', filhos: pecasCaixa() }], [], 'polygons'),
  };
}

// Executado direto: grava os arquivos nesta pasta
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pasta = path.dirname(fileURLToPath(import.meta.url));
  for (const [nome, xml] of Object.entries(fixtures())) fs.writeFileSync(path.join(pasta, `${nome}.dae`), xml);
  console.log(`Fixtures gravadas em ${pasta}`);
}
