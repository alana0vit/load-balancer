# Escalabilidade de Aplicações Web com Load Balancer

Demonstração prática de balanceamento de carga: uma aplicação web simples (Node.js +
Express) executando em **3 instâncias independentes**, atrás de um **HAProxy** atuando
como único ponto de entrada.

## Arquitetura

```
Cliente (navegador / curl)
        |
        v
  HAProxy (porta 8080) <-- único endereço acessado
        |
        +--> app-01 (porta interna 3000)
        +--> app-02 (porta interna 3000)
        +--> app-03 (porta interna 3000)

  Painel de status do HAProxy: http://localhost:8404/stats
```

- Cada instância roda em um **container Docker separado**, com a variável de ambiente
  `INSTANCE_ID` diferente (`app-01`, `app-02`, `app-03`), definida direto no
  `docker-compose.yml` (não usamos arquivo `.env` — é o mesmo efeito, só que mais
  visual: dá pra ver as 3 instâncias e seus IDs num único lugar). É essa variável — e
  não algo fixo no código — que define o identificador exibido e a cor de fundo da
  página.
- O HAProxy distribui as requisições em **round-robin**.
- Health check **ativo**: o HAProxy bate em `GET /health` de cada instância a cada
  3 segundos (`option httpchk` + `inter 3s`), independente de haver tráfego real.
  Depois de 2 falhas seguidas (`fall 2`) a instância é marcada como DOWN e sai do
  round-robin; depois de 2 sucessos seguidos (`rise 2`) ela volta a receber tráfego.
  Isso pode ser acompanhado visualmente em tempo real no painel de estatísticas.
- Cabeçalho `X-Served-By` devolvido em toda resposta, com o ID da instância.

## Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| Aplicação | Node.js 20 + Express |
| Load balancer | HAProxy (imagem oficial `haproxy:2.8-alpine`) |
| Orquestração | Docker Compose |

## Estrutura do repositório

```
loadbalancer-lab/
├── app/
│   ├── server.js        # aplicação Express
│   ├── package.json
│   └── Dockerfile
├── haproxy/
│   └── haproxy.cfg       # configuração do load balancer (health check ativo)
├── scripts/
│   └── test_distribution.sh   # script do teste de volume
└── docker-compose.yml
```

## Como executar

Pré-requisito: Docker Desktop instalado e rodando.

```bash
cd loadbalancer-lab
docker compose up --build
```

Isso sobe as 3 instâncias da aplicação e o HAProxy na frente delas. Depois de alguns
segundos, acesse:

```
http://localhost:8080          # aplicação (via load balancer)
http://localhost:8404/stats    # painel de status do HAProxy
```

Para rodar em segundo plano: `docker compose up --build -d`
Para derrubar tudo: `docker compose down`

## Como reproduzir os testes de verificação (seção 4 do enunciado)

**1. Teste visual de alternância**
Abra `http://localhost:8080` no navegador e recarregue com `Ctrl+F5` várias vezes.
O identificador ("Respondido por: app-XX") e a cor de fundo devem mudar a cada
recarregamento, em um ciclo previsível (01 → 02 → 03 → 01...).

**2. Teste por linha de comando**
```bash
for i in {1..50}; do curl -sI http://localhost:8080 | grep -i x-served-by; done
```
Deve mostrar instâncias diferentes se alternando.

**3. Teste de distribuição em volume**
```bash
chmod +x scripts/test_distribution.sh
./scripts/test_distribution.sh 100
```
O script dispara 100 requisições e mostra quantas cada instância atendeu — o
esperado é uma contagem próxima de ~33 cada.

**4. Teste de falha (tolerância a falhas)**
```bash
docker stop app-02
```
Abra `http://localhost:8404/stats` — em poucos segundos (até 2 checagens de 3s) a
linha de `app-02` vira vermelha (DOWN). Rode o teste de volume de novo e confirme
que só `app-01` e `app-03` aparecem:
```bash
./scripts/test_distribution.sh 30
```
Para reativar:
```bash
docker start app-02
```
No painel de stats ela volta a ficar verde (UP) assim que responde ao health check
de novo.

**5. Teste de escala (subir uma 4ª instância)**
1. No `docker-compose.yml`, descomente o bloco do serviço `app-04`.
2. No `haproxy/haproxy.cfg`, descomente a linha `server app-04 app-04:3000 check`
   dentro do `backend app_back`.
3. Suba a nova instância e recarregue a configuração do HAProxy:
   ```bash
   docker compose up -d --build app-04
   docker compose restart load-balancer
   ```
4. Rode `./scripts/test_distribution.sh 100` de novo — agora `app-04` também aparece
   na contagem, e no painel `/stats` ela aparece como uma nova linha UP.

**6. Evidência nos logs**
```bash
docker compose logs -f
```
Mostra, em tempo real, cada instância recebendo e respondendo requisições, e o
HAProxy fazendo os health checks e distribuindo entre elas.

**Prova negativa (acesso direto)**
As instâncias não expõem porta pro host — só o HAProxy (porta 8080) é acessível de
fora. Isso já comprova, por construção, que não dá pra "burlar" o load balancer. Se
quiser demonstrar isso ao vivo, tente `curl http://localhost:3000` e mostre que não
há nada exposto naquela porta na máquina host — só dentro da rede interna do
Compose.

## Variáveis de ambiente — onde estão e como conferir

Cada instância recebe `INSTANCE_ID` e `PORT` via `environment:` no
`docker-compose.yml` (não usamos `.env` por opção, não por limitação). Pra provar
ao vivo que a variável está mesmo dentro do container:
```bash
docker compose exec app-01 env | grep INSTANCE_ID
```

## Health check — as duas camadas

1. **Rota `/health` na aplicação**: só um endpoint que devolve `200 OK` com JSON,
   pra alguém (ou algo) checar se a instância está viva.
2. **Quem usa essa rota**:
   - O **HAProxy** chama ativamente, a cada 3s, e decide sozinho tirar/recolocar
     instâncias no round-robin (ver seção Arquitetura acima).
   - O **Docker** também usa (bloco `healthcheck:` de cada serviço no compose),
     e isso aparece como "healthy"/"unhealthy" em `docker compose ps`.

## Limitações e possíveis evoluções
- **Auto-scaling real**: hoje o número de instâncias é fixo e a 4ª instância é
  adicionada manualmente (descomentando linhas). Uma instância nova aparecer
  sozinha, sem intervenção, exige um orquestrador com esse recurso nativo — Docker
  Swarm (`docker service scale`) ou Kubernetes (HPA). O Docker Compose puro não
  tem auto-scaling.
