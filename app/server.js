const express = require('express');
const os = require('os');

const app = express();

const PORT = process.env.PORT || 3000;
const INSTANCE_ID = process.env.INSTANCE_ID || 'unknown';

// Cor de fundo fixa por instância conhecida; qualquer ID novo recebe uma cor
// gerada a partir de um hash simples, então basta definir a variável de
// ambiente INSTANCE_ID para uma 4ª/5ª instância funcionar sem tocar no código.
const KNOWN_COLORS = {
  'app-01': '#2b6cb0', // azul
  'app-02': '#2f855a', // verde
  'app-03': '#dd6b20', // laranja
  'app-04': '#805ad5', // roxo
};

function colorFor(id) {
  if (KNOWN_COLORS[id]) return KNOWN_COLORS[id];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 40%)`;
}

// Middleware: adiciona o cabeçalho de identificação em TODAS as respostas
app.use((req, res, next) => {
  res.set('X-Served-By', INSTANCE_ID);
  next();
});

app.get('/', (req, res) => {
  const now = new Date().toISOString();
  const bg = colorFor(INSTANCE_ID);
  res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Load Balancer Demo</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, Segoe UI, Roboto, sans-serif;
      background: ${bg};
      color: #fff;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .card {
      background: rgba(0,0,0,0.25);
      padding: 40px 60px;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    h1 { font-size: 2.5rem; margin: 0 0 10px; }
    p { font-size: 1.1rem; margin: 4px 0; opacity: 0.9; }
    .tag {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 0.9rem;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Respondido por: ${INSTANCE_ID}</h1>
    <p>Hostname do container: ${os.hostname()}</p>
    <p>Horário da resposta: ${now}</p>
    <p>Porta interna: ${PORT}</p>
    <div class="tag">Recarregue a página (Ctrl+F5) para ver a instância mudar</div>
  </div>
</body>
</html>`);
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', instance: INSTANCE_ID, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] escutando na porta ${PORT}`);
});
