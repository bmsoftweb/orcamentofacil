import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';
import { checkDbHealth } from './server/db.js';
import { expirarVencidos } from './server/orcamentoEdicao.js';

/** Entrada para execução local (npm run dev / start) */
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`OrçamentoFácil rodando em http://0.0.0.0:${PORT}`);
    const db = await checkDbHealth();
    console.log(db.connected ? `MySQL: ${db.host} / ${db.database}` : `MySQL indisponível: ${db.error}`);
    // Orçamentos enviados com a validade vencida viram EXPIRADO: ao subir e a cada hora
    const expirar = () => expirarVencidos().then((n) => n && console.log(`${n} orçamento(s) expirado(s).`)).catch((e) => console.error(`Expiração: ${e.message}`));
    expirar();
    setInterval(expirar, 60 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});
