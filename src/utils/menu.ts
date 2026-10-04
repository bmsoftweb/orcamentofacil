import {
  LayoutDashboard,
  KeyRound,
  Settings,
  Database,
  Users,
  PencilRuler,
  Truck,
  CreditCard,
  Ruler,
  Tags,
  Palette,
  Layers,
  Package,
  Wrench,
  Hammer,
  Shapes,
  ListChecks,
  FlaskConical,
  Waypoints,
  Box,
  FileText,
  HandCoins,
  type LucideIcon,
} from 'lucide-react';
import { ResourceDef, ResourceGroup, Usuario } from '../types';
import { GROUP_LABELS } from './formatters';

/** Mapa dos ícones declarados no registro de metadados do servidor */
const ICONS: Record<string, LucideIcon> = {
  KeyRound,
  Users,
  PencilRuler,
  Truck,
  CreditCard,
  Ruler,
  Tags,
  Palette,
  Layers,
  Package,
  Wrench,
  Hammer,
  Shapes,
  ListChecks,
  FlaskConical,
  Waypoints,
  Box,
  FileText,
};

const GROUP_ORDER: ResourceGroup[] = ['orcamentos', 'cadastros', 'catalogo', 'regras', 'acesso'];

export const PERFIL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  ORCAMENTISTA: 'Orçamentista',
  VENDEDOR: 'Vendedor',
  PRODUCAO: 'Produção',
};

export interface ItemMenu {
  id: string;
  label: string;
  descricao: string;
  icone: LucideIcon;
}

/** Opções só de administrador (mesma lista de SO_ADMIN em server/app.ts) */
const SO_ADMIN = ['usuarios', 'configuracoes'];

/** Opções do menu, agrupadas como na barra lateral */
export function gruposDoMenu(resources: ResourceDef[]): { titulo: string; itens: ItemMenu[] }[] {
  const grupos = [
    {
      titulo: 'Visão Geral',
      itens: [
        { id: 'dashboard', label: 'Painel', descricao: 'Indicadores dos orçamentos', icone: LayoutDashboard },
        { id: 'relatorio_rt', label: 'Relatório de RT', descricao: 'RT dos arquitetos por período', icone: HandCoins },
      ],
    },
    ...GROUP_ORDER.map((group) => ({
      titulo: GROUP_LABELS[group] || group,
      itens: resources
        .filter((r) => r.group === group && !r.oculto)
        .map((r) => ({ id: r.name, label: r.label, descricao: r.description, icone: ICONS[r.icon] || Database })),
    })),
    { titulo: 'Sistema', itens: [{ id: 'configuracoes', label: 'Configurações', descricao: 'Empresa e parâmetros de cálculo', icone: Settings }] },
  ];
  return grupos.filter((g) => g.itens.length);
}

/** O usuário acessa a opção: Usuários e Configurações só o administrador */
export function podeAcessar(usuario: Usuario | null, id: string): boolean {
  if (!usuario) return false;
  return !SO_ADMIN.includes(id) || usuario.perfil === 'ADMIN';
}
