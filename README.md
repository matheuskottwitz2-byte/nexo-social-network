# Nexo

Nexo é uma rede social full stack, responsiva e instalável, criada como projeto de estudo e portfólio. A aplicação reúne autenticação, perfis, publicações e interações sociais em uma interface própria, sem reproduzir a identidade visual de outras plataformas.

## Sobre

O objetivo desta primeira versão é oferecer uma base full stack pronta para operar de ponta a ponta quando conectada a um projeto Supabase: o React renderiza e coordena a experiência do usuário, enquanto o Supabase fornece autenticação, PostgreSQL e armazenamento. As regras importantes não dependem somente da interface; o banco também valida propriedade, unicidade e acesso por meio de constraints e Row Level Security (RLS).

Não há um backend falso substituindo o Supabase. Sem as variáveis de ambiente e a migration aplicadas, os recursos que dependem de dados não funcionam. Este repositório não inclui credenciais nem, por si só, comprova integração com um projeto Supabase remoto. O dashboard usa somente dados persistidos e exibe estado vazio quando ainda não há atividade.

## Funcionalidades

- Cadastro com nome, username único, e-mail e senha.
- Login, logout, restauração da sessão e proteção de rotas privadas.
- Feed com publicações reais, ordenadas da mais recente para a mais antiga.
- Abas de feed geral e de publicações das pessoas seguidas.
- Criação e exclusão da própria publicação.
- Perfil em `/@username`, edição do próprio perfil e avatar.
- Curtir e remover curtida com atualização otimista do cache, rollback em erro e proteção contra duplicidade no banco.
- Comentários em uma página individual de publicação e exclusão pelo autor.
- Seguir e deixar de seguir usuários, sem auto-follow ou relações duplicadas.
- Busca de pessoas por nome ou username.
- Dashboard pessoal com métricas e gráfico derivados do banco.
- Tema claro e escuro, com preferência persistida no navegador.
- Layout adaptado para desktop e dispositivos móveis.
- Estados de carregamento, vazio, erro e feedback de operações.
- PWA instalável, mantendo o Supabase como fonte de dados on-line.

## Tecnologias

- React e TypeScript
- Vite
- Tailwind CSS 4
- React Router
- TanStack Query
- Supabase Auth, PostgreSQL e Storage
- Recharts
- Lucide React
- PWA com service worker gerado durante o build

Redux não é necessário nesta arquitetura. Estado remoto fica no cache do TanStack Query; sessão, tema e estado local de componentes usam mecanismos menores e específicos.

## Arquitetura

O código é organizado por responsabilidade:

```text
src/
├── components/   # componentes visuais reutilizáveis
├── contexts/     # sessão e preferência de tema
├── hooks/        # hooks compartilhados
├── layouts/      # estrutura de navegação e páginas
├── lib/          # clientes e configurações de bibliotecas
├── pages/        # componentes associados às rotas
├── services/     # consultas e mutações no Supabase
├── styles/       # tokens visuais e estilos responsivos
├── types/        # tipos de domínio e banco
└── utils/        # funções puras e formatação
```

Componentes não acessam credenciais nem implementam regras de autorização. Eles usam hooks e serviços tipados, que conversam com uma única instância do cliente Supabase. O banco continua sendo a última barreira de segurança.

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para uma explicação detalhada.

## Banco de dados

As entidades centrais são:

- `auth.users`: identidade e credenciais, gerenciadas pelo Supabase Auth.
- `profiles`: dados públicos do usuário; relação 1:1 com `auth.users` e criação automática após o cadastro.
- `posts`: texto, autor e timestamps das publicações.
- `likes`: associação entre usuário e publicação.
- `comments`: comentários associados a uma publicação e a um autor.
- `follows`: associação direcionada entre quem segue e quem é seguido.

Foreign keys mantêm as relações válidas, constraints impedem curtidas/follows duplicados e índices atendem as consultas principais. Exclusões relacionadas usam o comportamento definido na migration para não deixar registros órfãos.

## Segurança

Todas as tabelas expostas ao cliente têm RLS habilitada. Em linhas gerais:

- perfis e conteúdo social possuem leitura pública na API, conforme as policies da migration;
- cada usuário altera somente `name`, `bio` e `avatar_url` do próprio perfil; o username não é editável pelo cliente;
- `author_id`/`user_id`/`follower_id` de uma escrita deve corresponder a `auth.uid()`;
- somente o autor remove seu post ou comentário;
- somente o dono cria ou remove sua curtida;
- somente o seguidor cria ou remove uma relação de follow;
- constraints complementam as policies para impedir duplicidade e auto-follow.

O frontend utiliza somente a Supabase Publishable Key, uma chave client-side de baixo privilégio. Secret Keys e credenciais associadas a `service_role` nunca devem ser colocadas em variáveis `VITE_*`, no navegador ou no repositório.

## Pré-requisitos

- Node.js 20.19 ou superior (uma versão LTS recente é recomendada).
- npm.
- Um projeto no [Supabase](https://supabase.com/).

## Como executar

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo local de ambiente a partir do exemplo:

   ```bash
   cp .env.example .env
   ```

   No PowerShell, use:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Preencha `.env` com os dados do seu projeto:

   ```env
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=SUA_PUBLISHABLE_KEY
   ```

4. Aplique a migration conforme a seção seguinte.

5. Inicie o ambiente de desenvolvimento:

   ```bash
   npm run dev
   ```

6. Abra o endereço exibido pelo Vite.

## Configuração do Supabase

### 1. Criar o projeto e obter as chaves

No painel do Supabase, crie um projeto. Na área de API do projeto, copie a URL e a **Publishable Key** para `.env`.

O arquivo `.env` é local e ignorado pelo Git. `.env.example` contém apenas nomes de variáveis e pode ser versionado.

### 2. Aplicar o schema SQL

O arquivo `supabase/migrations/20260814000000_initial_schema.sql` é a fonte de verdade do schema inicial. Ele cria extensões, tabelas, índices, triggers, RLS, grants, RPCs do dashboard e o bucket de avatar. Existem duas formas de aplicá-lo.

Pelo painel, abra o **SQL Editor**, copie o arquivo inteiro, execute e confirme que tabelas, índices, triggers, policies e o bucket `avatars` foram criados sem erro. Em versões futuras, aplique migrations adicionais em ordem cronológica.

Com o Supabase CLI instalado e autenticado:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Não execute trechos isolados da migration: policies e triggers dependem das tabelas e funções criadas antes deles.

### 3. Auth e e-mail

Em **Authentication**, mantenha o provedor de e-mail habilitado. Se a confirmação de e-mail estiver ativa, o cadastro só produzirá uma sessão após a confirmação; isso é comportamento do projeto Supabase, não um erro no formulário.

Adicione as URLs local e de produção à lista de redirects permitidos antes de testar links de autenticação em produção.

### 4. Avatar

O upload usa o bucket público `avatars`, com limite de 5 MB e MIME types definidos na migration. A leitura é pública, mas escrita e exclusão são restritas ao dono. O caminho precisa começar com o UUID autenticado, no formato `<auth.uid()>/<arquivo>`; não torne o bucket inteiro gravável como solução temporária.

## Scripts

Os scripts definidos em `package.json` são a referência exata. A base usa os comandos abaixo:

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | inicia o Vite com atualização durante o desenvolvimento |
| `npm run build` | valida TypeScript e gera a versão de produção |
| `npm run lint` | executa as regras estáticas do projeto |
| `npm run typecheck` | verifica os tipos sem gerar o bundle de produção |
| `npm run preview` | serve localmente o resultado de `dist/` |

Antes de publicar, execute pelo menos:

```bash
npm run lint
npm run typecheck
npm run build
```

Esses comandos validam o código, os tipos e o bundle localmente. Eles não substituem testes de integração contra um projeto Supabase real; Auth, RLS, Storage e RPCs devem ser verificados depois que as credenciais e a migration forem configuradas no ambiente remoto.

## PWA

O manifest fica em `public/manifest.webmanifest`; o plugin de PWA gera e registra o service worker no build. A PWA melhora instalação e carregamento dos arquivos estáticos, mas não promete criação de posts ou outras mutações sem rede. Requisições ao Supabase continuam dependendo de conectividade.

Para testar a instalação de modo confiável, use `npm run build` seguido de `npm run preview`, pois o modo de desenvolvimento não representa integralmente o service worker de produção.

## Roadmap

Itens que não fazem parte do núcleo desta primeira entrega e podem ser evoluídos depois:

- imagens e anexos em publicações;
- notificações e atualizações em tempo real;
- favoritos e listas;
- denúncias, bloqueio e ferramentas de moderação;
- paginação infinita e estratégias avançadas de ranking;
- testes automatizados de unidade, integração e ponta a ponta;
- observabilidade e métricas operacionais.

## Material de estudo

- [Arquitetura](docs/ARCHITECTURE.md): fluxo entre interface, serviços, Supabase e RLS.
- [Notas de entrevista](docs/INTERVIEW_NOTES.md): perguntas para estudar decisões e trade-offs do projeto.
