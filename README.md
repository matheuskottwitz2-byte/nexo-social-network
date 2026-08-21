# Nexo

Uma rede social full stack para publicar ideias, conversar e acompanhar pessoas. O projeto combina uma interface responsiva em React com dados, autenticação e autorização no Supabase.

## O projeto

O Nexo é um projeto de estudo e portfólio com fluxos sociais completos, sem backend simulado. Publicações, perfis, relações e métricas usam dados persistidos; quando não há atividade, a interface apresenta estados vazios em vez de conteúdo fictício.

A aplicação é uma SPA instalável e oferece temas claro e escuro. O acesso aos dados acontece com a sessão do usuário, enquanto o PostgreSQL aplica as regras de integridade e Row Level Security.

## Principais recursos

### Social

- Feed geral e feed de pessoas seguidas.
- Criação e exclusão das próprias publicações, com texto, até quatro imagens ou ambos.
- Otimização das imagens no navegador, preferindo WebP e limitando o maior lado a 1.920 px, com grid responsivo e visualizador ampliado.
- Enquetes em publicações, com duas a quatro opções, duração configurável, um voto por usuário e resultados após votar ou encerrar.
- Curtidas com atualização otimista e rollback em caso de erro.
- Comentários em publicações.
- Seguir e deixar de seguir pessoas.
- Busca por nome ou username.

### Conta e perfil

- Cadastro, login, logout e restauração de sessão.
- Rotas privadas protegidas.
- Perfil público com bio, atividade, avatar e capa personalizada.
- Avatar com crop, reposicionamento e zoom de JPEG, PNG, WebP ou AVIF, gerando WebP quadrado; GIFs de avatar antigos continuam visíveis, mas novos não são aceitos.
- Capa com crop 3:1 para imagens estáticas ou envio do GIF original, sem crop, para preservar a animação.
- Seleção de avatar e capa por arquivo ou por botões explícitos de leitura da área de transferência.

### Plataforma

- Dashboard pessoal com métricas e gráfico derivados do banco.
- Interface responsiva para desktop e mobile.
- Temas claro e escuro com preferência persistida.
- PWA instalável para os arquivos da aplicação; operações sociais continuam on-line.
- Estados de carregamento, vazio, erro e confirmação de ações destrutivas.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Interface | React 19, TypeScript, Vite e Tailwind CSS 4 |
| Navegação e dados | React Router e TanStack Query |
| Backend gerenciado | Supabase Auth, PostgreSQL, PostgREST/RPC e Storage |
| Visualização e UI | Recharts, Lucide React e react-easy-crop |
| PWA | vite-plugin-pwa e Workbox |

Fluxo principal: `interface → hooks e cache → serviços tipados → Supabase`.

## Segurança

- RLS limita leituras e escritas de acordo com a sessão e a propriedade de cada registro.
- Foreign keys, constraints de unicidade e checks complementam a autorização do banco.
- O frontend usa somente `VITE_SUPABASE_PUBLISHABLE_KEY`, uma chave client-side de baixo privilégio.
- Secret Keys e credenciais associadas a `service_role` não devem ser colocadas no navegador, em variáveis `VITE_*` ou no repositório.

O script manual [scripts/rls-smoke-test.mjs](scripts/rls-smoke-test.mjs) permite validar as fronteiras de RLS contra um projeto Supabase real. Ele autentica duas contas de teste isoladas, verifica operações permitidas e bloqueadas e remove os registros temporários criados durante a execução.

Para executá-lo, disponibilize apenas no ambiente do processo:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
TEST_USER_A_EMAIL
TEST_USER_A_PASSWORD
TEST_USER_B_EMAIL
TEST_USER_B_PASSWORD
```

Depois execute:

```bash
node scripts/rls-smoke-test.mjs
```

As variáveis `TEST_USER_*` pertencem somente ao smoke test manual. Não as exponha no frontend nem as versione. A existência do script não significa que testes contra um ambiente remoto tenham sido executados neste clone.

## Rodando localmente

Requisitos: Node.js 20.19 ou superior, npm e um projeto Supabase.

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo local de ambiente:

   ```bash
   cp .env.example .env
   ```

   No PowerShell, use `Copy-Item .env.example .env`.

3. Preencha as credenciais client-side do projeto:

   ```env
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=SUA_PUBLISHABLE_KEY
   ```

4. Aplique, em ordem cronológica, as migrations disponíveis em [`supabase/migrations/`](supabase/migrations/) no projeto Supabase.

5. Inicie a aplicação:

   ```bash
   npm run dev
   ```

Detalhes de schema, Auth, Storage, RLS e fluxo de dados estão na [documentação de arquitetura](docs/ARCHITECTURE.md).

## Validações locais

```bash
npm run lint
npm run typecheck
npm run build
```

Esses comandos verificam estática, tipos e bundle local. Eles não substituem testes de integração com Auth, banco, Storage, RPCs e RLS no projeto Supabase remoto.

## Roadmap

- Notificações, realtime e moderação.
- Cobertura automatizada de unidade, integração e ponta a ponta.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) — estrutura, fluxos, dados, segurança e trade-offs.
- [Notas de entrevista](docs/INTERVIEW_NOTES.md) — roteiro para apresentar e discutir as decisões do projeto.
