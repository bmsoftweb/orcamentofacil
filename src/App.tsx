import { useCallback, useEffect, useMemo, useState } from 'react';
import { Usuario, ResourceDef, DbConnectionStatus } from './types';
import { setTokenSessao, setAoExpirarSessao, fetchResources, fetchDbStatus, invalidateOptions, validarSessao } from './services/api';
import { limparConfigListas } from './utils/configListas';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { CrudView } from './components/CrudView';
import { ConfiguracoesView } from './components/ConfiguracoesView';
import { BotaoReajuste, BotaoTestarPadrao } from './components/AcoesCatalogo';
import { BotaoImportarDae } from './components/BotaoImportarDae';
import { ImportacaoView } from './components/ImportacaoView';
import { BotaoAcao } from './components/MenuAcoes';
import { AcoesOrcamento } from './components/AcoesOrcamento';
import { OrcamentoView } from './components/orcamento/OrcamentoView';
import { Painel } from './components/Painel';
import { RelatorioRt } from './components/RelatorioRt';
import { Box } from 'lucide-react';
import { podeAcessar } from './utils/menu';
import { ThemeMode, getInitialTheme, applyTheme } from './utils/theme';
import { Sessao, lerSessao, salvarSessao, limparSessao } from './utils/session';

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const handleToggleTheme = useCallback(() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  // Sessão (token assinado pelo servidor, guardado no navegador)
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    const s = lerSessao();
    // O token precisa estar no cliente HTTP antes da primeira chamada
    setTokenSessao(s?.token ?? null);
    return s;
  });
  const usuario: Usuario | null = sessao?.usuario ?? null;

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [resources, setResources] = useState<ResourceDef[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const [createToken, setCreateToken] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  /** Motivo exibido na tela de login quando a sessão é recusada */
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  /** Troca de tela; o gatilho do botão "Novo" zera para a tela nova não abrir uma inclusão sozinha */
  const navegar = useCallback((tab: string) => {
    setCreateToken(0);
    setRegistroInicial(null);
    setActiveTab(tab);
  }, []);

  /** Registro que um cadastro abre em edição quando outra tela leva até ele (ex.: painel → orçamento) */
  const [registroInicial, setRegistroInicial] = useState<{ tela: string; id: number; seq: number } | null>(null);
  const abrirRegistro = useCallback((tela: string, id: number) => {
    setCreateToken(0);
    setActiveTab(tela);
    setRegistroInicial({ tela, id, seq: Date.now() });
  }, []);

  const handleLogout = useCallback(() => {
    setSessao(null);
    setResources([]);
    setRecordCounts({});
    setActiveTab('dashboard');
    invalidateOptions();
    setTokenSessao(null);
    limparConfigListas();
    limparSessao();
  }, []);

  // Qualquer 401 da API (token expirado, usuário desativado) volta para o login
  useEffect(() => {
    setAoExpirarSessao((msg) => {
      handleLogout();
      setAvisoLogin(msg);
    });
    return () => setAoExpirarSessao(null);
  }, [handleLogout]);

  // Sessão guardada no navegador é conferida ao abrir: o usuário pode ter sido desativado
  useEffect(() => {
    if (!sessao) return;
    validarSessao().then(({ valida, error }) => {
      if (valida === false) {
        handleLogout();
        setAvisoLogin(error || 'Sua sessão expirou. Entre novamente.');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token]);

  // Metadados dos recursos e saúde do banco
  useEffect(() => {
    if (!sessao) return;
    let alive = true;
    fetchResources()
      .then((list) => alive && setResources(list))
      .catch((err) => console.warn('Falha ao carregar os metadados dos recursos:', err));
    fetchDbStatus().then((s) => alive && setDbStatus(s));
    return () => {
      alive = false;
    };
  }, [sessao?.token]);

  const handleCountChange = useCallback((resourceName: string, total: number) => {
    setRecordCounts((prev) => (prev[resourceName] === total ? prev : { ...prev, [resourceName]: total }));
  }, []);

  const activeResource = useMemo(
    () => (podeAcessar(usuario, activeTab) ? resources.find((r) => r.name === activeTab && !r.oculto) || null : null),
    [resources, activeTab, usuario],
  );

  if (!sessao || !usuario) {
    return (
      <LoginView
        avisoInicial={avisoLogin}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLoginSuccess={(novoUsuario, token, lembrar) => {
          const nova = { usuario: novoUsuario, token };
          setTokenSessao(token);
          setSessao(nova);
          setActiveTab('dashboard');
          salvarSessao(nova, lembrar);
          setAvisoLogin(null);
          showToast(`Bem-vindo, ${novoUsuario.nome}!`);
        }}
      />
    );
  }

  const TITULOS: Record<string, [string, string]> = {
    dashboard: ['Painel', 'Visão geral dos orçamentos (a revisão mais recente de cada número)'],
    relatorio_rt: ['Relatório de RT', 'Reserva técnica dos arquitetos nos orçamentos aprovados, por período'],
    configuracoes: ['Configurações', 'Dados da empresa e parâmetros de cálculo dos orçamentos'],
  };
  const [headerTitle, headerSubtitle] = activeResource
    ? [activeResource.label, activeResource.description]
    : TITULOS[activeTab] || ['OrçamentoFácil', ''];

  return (
    <div className="h-screen overflow-hidden bg-stone-100/70 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[70] bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={navegar}
        resources={resources}
        recordCounts={recordCounts}
        usuario={usuario}
        onLogout={handleLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          title={headerTitle}
          subtitle={headerSubtitle}
          dbStatus={dbStatus}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onRefresh={() => setRefreshToken((t) => t + 1)}
          onCreate={activeResource?.canCreate ? () => setCreateToken((t) => t + 1) : undefined}
          createLabel={activeResource ? `Novo ${activeResource.labelSingular}` : undefined}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {activeTab === 'configuracoes' && podeAcessar(usuario, 'configuracoes') ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <ConfiguracoesView key={refreshToken} resource={resources.find((r) => r.name === 'configuracoes')} onToast={showToast} />
          </main>
        ) : activeResource ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <CrudView
              key={activeResource.name}
              resource={activeResource}
              allResources={resources}
              refreshToken={refreshToken}
              createToken={createToken}
              onToast={showToast}
              onCountChange={handleCountChange}
              onNavigate={navegar}
              usuario={usuario}
              registroInicial={registroInicial?.tela === activeResource.name ? registroInicial : null}
              acoesLista={
                activeResource.preco && ['ADMIN', 'ORCAMENTISTA'].includes(usuario.perfil)
                  ? (recarregar) => <BotaoReajuste resource={activeResource} onFeito={recarregar} onToast={showToast} />
                  : activeResource.name === 'mapeamentos_dae'
                    ? () => <BotaoTestarPadrao />
                    : activeResource.name === 'importacoes_dae'
                      ? (recarregar) => <BotaoImportarDae onImportado={recarregar} onToast={showToast} />
                      : undefined
              }
              acoesLinha={
                activeResource.name === 'importacoes_dae'
                  ? (row, { abrir }) => <BotaoAcao icone={Box} titulo="Abrir" descricao="Árvore de objetos e visualizador 3D" onClick={() => abrir(row)} />
                  : activeResource.name === 'orcamentos'
                    ? (row, { recarregar }) => <AcoesOrcamento registro={row} onFeito={recarregar} onToast={showToast} />
                    : undefined
              }
              acoesEmMenu={activeResource.name === 'orcamentos'}
              renderEditor={
                activeResource.name === 'importacoes_dae'
                  ? (record, fechar) => (record ? <ImportacaoView registro={record} onFechar={fechar} onToast={showToast} /> : null)
                  : activeResource.name === 'orcamentos'
                    ? (record, fechar, aoGravar) =>
                        record ? <OrcamentoView registro={record} resources={resources} usuario={usuario} onFechar={fechar} onGravado={aoGravar} onToast={showToast} /> : null
                    : undefined
              }
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto min-h-0 w-full">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
              {activeTab === 'dashboard' ? (
                <Painel refreshToken={refreshToken} onAbrirOrcamento={(id) => abrirRegistro('orcamentos', id)} />
              ) : activeTab === 'relatorio_rt' ? (
                <RelatorioRt onToast={showToast} />
              ) : (
                <div className="py-24 text-center text-sm text-stone-500 dark:text-stone-400">Carregando a estrutura da tela…</div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
