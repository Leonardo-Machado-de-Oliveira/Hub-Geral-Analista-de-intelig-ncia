import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      success: true,
      status: 'online',
      service: 'safetitulo-v2',
      erpTransport: 'navegador-direto (CORS)'
    });
  });

  app.use('/api', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(404).json({
      success: false,
      status: 404,
      route: `${req.method} ${req.originalUrl}`,
      message: 'Rota não encontrada. As chamadas ao ERP Compy são feitas diretamente do navegador via CORS (sem proxy no backend).'
    });
  });

  app.get('/download', (_req: Request, res: Response) => {
    const distHtml = path.resolve(__dirname, 'dist', 'index.html');
    const rootHtml = path.resolve(__dirname, 'index.html');
    const targetFile =
      process.env.NODE_ENV === 'production' && fs.existsSync(distHtml) ? distHtml : rootHtml;

    if (!fs.existsSync(targetFile)) {
      res.status(404).send('Arquivo index.html não encontrado.');
      return;
    }

    const content = fs.readFileSync(targetFile, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="gerador-titulos-safetitulo.html"');
    res.send(content);
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Server] safetitulo-v2 online em http://0.0.0.0:${port} (transporte ERP: navegador-direto CORS)`);
  });
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isEntrypoint) {
  startServer().catch((err) => {
    console.error('Erro fatal ao iniciar servidor:', err);
    process.exit(1);
  });
}
