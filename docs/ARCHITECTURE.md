# Arquitetura do Nexo

Este documento explica a arquitetura da primeira versão do Nexo em linguagem direta. Ele deve ser lido junto do código e da migration: nomes exatos de colunas, policies e scripts sempre têm o SQL e o `package.json` como fonte de verdade.

## Visão geral

O Nexo é uma aplicação React de página única (SPA) que acessa diretamente os serviços do Supabase com a sessão do usuário.

```text
Navegador
  ├─ React Router          → escolhe página/layout e protege rotas privadas
  ├─ React + Tailwind      → renderiza a interface responsiva
  ├─ TanStack Query        → busca, cache, mutações e revalidação
  └─ Supabase JS           → Auth, PostgREST/RPC e Storage via Publishable Key
                                  │
                                  ▼
                         Supabase / PostgreSQL
                         ├─ constraints e foreign keys
                         ├─ Row Level Security
                         ├─ Auth
                         └─ bucket de avatars
```

Não existe um servidor próprio guardando uma chave privilegiada. Por isso, toda operação de dados ou Storage enviada pelo navegador é tratada como não confiável e precisa ser aceita pelas policies correspondentes.

## Organização do frontend

A separação de pastas evita dois problemas comuns: um `App.tsx` responsável por tudo e componentes visuais contendo consultas SQL espalhadas.

- `components/`: peças genéricas, como botões, diálogos, skeletons e estados vazios.
- `contexts/`: estado pequeno e transversal de autenticação e tema.
- `pages/`: ponto de entrada de cada rota; compõe componentes e trata o estado geral da tela.
- `layouts/`: shell responsivo, sidebar desktop, navegação mobile e área central.
- `hooks/`: comportamento reutilizável, inclusive hooks que encapsulam queries e mutations.
- `services/`: chamadas ao Supabase e transformação mínima da resposta.
- `lib/`: cliente Supabase, Query Client e configuração de bibliotecas.
- `styles/`: tokens de tema e estilos responsivos da identidade visual.
- `types/`: contratos TypeScript compartilhados.
- `utils/`: funções puras, por exemplo formatação e datas.

A regra prática é: a página coordena, o componente apresenta, o hook administra estado/ciclo de vida, o service conversa com a fonte de dados e o banco autoriza.

## Rotas e layouts

React Router associa URLs a páginas e permite layouts aninhados. Nesta primeira versão, login e cadastro são públicos; a experiência social passa por um guard que aguarda a restauração da sessão antes de decidir entre renderizar a página ou redirecionar ao login.

Rotas importantes do produto:

- `/`: feed do usuário autenticado.
- `/@username`: perfil identificado por username.
- `/post/:id`: publicação e seus comentários.
- `/search?q=termo`: resultados de busca de usuários.
- `/dashboard`: métricas do usuário autenticado.

Uma rota `*` trata endereços inexistentes. A decisão de acesso da interface melhora a experiência, mas não substitui RLS: uma pessoa pode chamar a API sem passar pelo Router.

## Autenticação

Supabase Auth armazena identidade e credenciais em `auth.users`. A tabela pública `profiles` guarda somente os dados sociais necessários ao produto.

Fluxo de cadastro:

1. A interface valida nome, username, e-mail e senha.
2. O cliente solicita o cadastro ao Supabase Auth.
3. O trigger `on_auth_user_created` executa `handle_new_user()` e cria, na mesma operação, um perfil com o UUID da identidade.
4. Se a confirmação de e-mail estiver habilitada, o usuário confirma o endereço antes de obter sessão.
5. O observador atualiza a sessão compartilhada; os guards reagem a esse estado e, no sign-out, o cache do TanStack Query é limpo.

Fluxo de carregamento:

1. Ao iniciar, a aplicação consulta a sessão persistida pelo Supabase.
2. Enquanto essa consulta não termina, o guard mostra um estado de carregamento em vez de redirecionar prematuramente.
3. Mudanças de autenticação atualizam o estado compartilhado.
4. No logout, a sessão é encerrada e dados privados do cache devem deixar de ser apresentados.

O token de acesso é enviado automaticamente pelo cliente Supabase. No PostgreSQL, `auth.uid()` identifica o usuário daquele token.

## Comunicação com o Supabase

O cliente Supabase é criado uma única vez a partir de:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

`VITE_*` fica disponível no bundle do navegador. Isso é esperado para a Publishable Key, que é destinada a clientes de baixo privilégio; segurança vem da sessão, das policies e das constraints. Secret Keys e credenciais associadas a `service_role` nunca pertencem ao frontend. O papel PostgreSQL `anon`, citado nas policies e grants, continua sendo o papel usado para requisições sem sessão e não é o nome da variável de ambiente.

Os services fazem operações explícitas, selecionando os campos e relacionamentos necessários. Hooks do TanStack Query dão a essas operações:

- uma `queryKey` estável;
- cache e compartilhamento do resultado;
- estados de carregamento e erro;
- invalidação depois de mutações;
- atualização otimista da curtida com snapshot e rollback do cache.

Depois de criar/excluir conteúdo, as queries afetadas são atualizadas ou invalidadas. Isso evita manter uma segunda cópia manual do banco em um store global.

Nesta versão, somente a curtida usa alteração otimista do cache. As demais mutations aguardam a resposta e então invalidam as queries relacionadas.

## Modelo de dados

### Identidade e perfil

```text
auth.users 1 ─── 1 profiles
```

O UUID do perfil corresponde ao UUID do usuário autenticado. `auth.users` cuida de login; `profiles` contém `username`, nome de exibição, bio, URL do avatar e timestamps. O username é normalizado para minúsculas, aceita de 3 a 30 letras minúsculas, números ou `_`, possui constraint de unicidade e não pode ser alterado pelo cliente. Validação prévia na interface serve apenas como feedback.

### Publicações

```text
profiles 1 ─── N posts
```

Cada post guarda a chave do autor, texto e timestamps. O feed consulta posts com os campos públicos do perfil e ordena por criação decrescente. A interface pode ocultar a ação de exclusão para terceiros, enquanto a policy garante que apenas o autor efetivamente a execute.

### Curtidas

```text
profiles N ─── N posts
          via likes
```

`likes` é uma tabela de junção. Uma constraint única sobre usuário e post impede duas curtidas simultâneas na mesma publicação, inclusive se houver clique duplo ou requisições concorrentes.

Curtir cria a linha; remover a curtida apaga a linha daquele usuário. Antes da mutation, o hook cancela as queries afetadas, guarda seus valores e atualiza `likedByMe` e `likeCount` no cache. Se o banco rejeitar a operação, o snapshot é restaurado e a interface exibe o erro. Ao final, as queries são revalidadas para convergir com o banco.

### Comentários

```text
profiles 1 ─── N comments N ─── 1 posts
```

O comentário pertence ao autor e à publicação. A página individual busca o post e seus comentários. A criação exige usuário autenticado e vínculo com `auth.uid()`; a exclusão exige que o usuário seja o autor do comentário.

### Seguidores

```text
profiles N ─── N profiles
          via follows
```

É uma relação direcionada: `follower_id` é quem segue e `following_id` é quem recebe o follow. Ela não é simétrica.

Duas constraints preservam o modelo:

- par (`follower_id`, `following_id`) único;
- `follower_id <> following_id` para impedir auto-follow.

Contagem de seguidores filtra pelo usuário no lado `following_id`; contagem de pessoas seguidas usa o lado `follower_id`.

## Dashboard sem dados inventados

O dashboard agrega dados associados ao usuário autenticado por duas RPCs `security invoker`:

- `get_dashboard_stats()` retorna totais e engajamento recente;
- `get_posts_over_time(days_back)` retorna uma série diária UTC contínua de posts, limitada entre 1 e 365 dias.

As RPCs não aceitam um UUID de usuário arbitrário; elas usam `auth.uid()`. Somente o papel `authenticated` recebe permissão de execução. Os valores incluem:

- total de posts próprios;
- curtidas e comentários recebidos nos posts próprios;
- seguidores e pessoas seguindo;
- publicações agrupadas por dia e engajamento agregado dos últimos 30 dias.

Essas métricas vêm de consultas/agregações ao PostgreSQL, nunca de arrays hardcoded. Um período sem eventos produz zero ou um estado vazio; a camada visual não cria valores para preencher o gráfico. Recharts recebe somente a série já derivada dos dados reais.

## Row Level Security

RLS adiciona um filtro de autorização a cada operação. Uma policy é avaliada pelo PostgreSQL, mesmo quando a chamada foi construída fora da aplicação.

Há dois tipos de condição relevantes:

- `USING`: determina quais linhas existentes podem ser lidas, alteradas ou removidas.
- `WITH CHECK`: valida a nova linha em `INSERT` ou o novo estado de `UPDATE`.

Resumo das garantias esperadas no schema:

| Entidade | Leitura | Escrita |
| --- | --- | --- |
| `profiles` | pública na API para perfil/busca | profile criado pelo trigger; update somente de `name`, `bio` e `avatar_url` do próprio UUID |
| `posts` | pública conforme o produto | insert/update/delete somente quando autor = `auth.uid()` |
| `likes` | leitura necessária aos contadores | insert/delete somente quando usuário = `auth.uid()` |
| `comments` | pública junto à publicação | insert/update/delete somente quando autor = `auth.uid()` |
| `follows` | leitura necessária aos perfis | insert/delete somente quando seguidor = `auth.uid()` |
| Storage de avatar | leitura pública do avatar | escrita limitada à pasta/objeto do próprio usuário |

Exemplo conceitual para exclusão de post:

```sql
using (auth.uid() = author_id)
```

Esconder o botão não oferece essa garantia. RLS oferece.

RLS e constraints têm responsabilidades diferentes. RLS responde “quem pode fazer?”, enquanto foreign keys, `unique`, `check` e `not null` respondem “este estado é válido?”. O projeto precisa das duas camadas.

## Storage de avatar

O arquivo fica no bucket público `avatars` e o perfil guarda sua URL pública, não os bytes da imagem. O bucket limita cada objeto a 5 MB e aceita JPEG, PNG, WebP, GIF e AVIF. O upload usa `<auth.uid()>/<arquivo>`, permitindo que as policies de `storage.objects` comparem o primeiro segmento com o usuário da sessão. A leitura é pública; insert, update e delete ficam restritos à pasta do dono.

Ao escolher um novo avatar, a aplicação envia um objeto com nome baseado em timestamp e depois persiste a nova URL no perfil. Se uma dessas etapas falhar, a mutation apresenta erro; esta versão ainda não remove automaticamente arquivos antigos ou um upload órfão caso a atualização do perfil falhe.

## Busca

O termo da URL é normalizado/sanitizado e enviado aos filtros da API do Supabase para nome e username. O código não executa SQL bruto vindo do navegador. Resultados retornam apenas os campos públicos necessários e levam à rota `/@username`.

A extensão `pg_trgm` e índices GIN em username/nome sustentam o padrão de busca por trecho. Em uma escala maior, busca textual e paginação podem substituir filtros simples.

## Tema, responsividade e acessibilidade

O tema é um estado de interface, não dado remoto. A preferência é persistida localmente e aplicada à raiz do documento; quando não existe escolha, a preferência do sistema pode ser usada como valor inicial.

O mesmo conteúdo usa navegação apropriada a cada largura: sidebar em desktop e navegação compacta no mobile. HTML semântico, labels, foco visível, botões reais e textos alternativos mantêm a base navegável sem depender apenas do mouse.

## PWA

O manifest é mantido em `public/manifest.webmanifest`, referenciado pelo `index.html` e copiado para o build. Ele contém nome, short name, cores e ícones. O plugin de PWA:

- registro/atualização de service worker;
- cache dos assets compilados.

Esse cache não transforma o PostgreSQL em banco offline. Dados sociais e mutations continuam dependentes do Supabase. Uma fila de sincronização offline exigiria conflitos, repetição idempotente e feedback próprios, e fica fora desta primeira versão.

## Tratamento de estados e erros

As principais telas distinguem, conforme o fluxo:

- carregando: skeleton ou indicador sem layout quebrado;
- sucesso com conteúdo;
- sucesso vazio: mensagem e próxima ação possível;
- erro: explicação compreensível e opção de tentar novamente quando aplicável;
- não encontrado: perfil/post inexistente;
- enviando: ação desabilitada para reduzir duplicidade acidental.

As operações exibem feedback de sucesso ou erro, e confirmações precedem exclusões destrutivas. Mensagens específicas existem para os fluxos principais; outros erros usam a mensagem devolvida pelo cliente Supabase ou um texto genérico de fallback.

## Decisões e trade-offs

- **Supabase em vez de API própria:** entrega Auth, banco, Storage e autorização no banco com menos infraestrutura. Em troca, o time precisa conhecer bem policies e o modelo de acesso do Supabase.
- **TanStack Query em vez de Redux:** a maior parte do estado compartilhado é remota e se beneficia de cache, invalidação e mutations. Redux adicionaria uma segunda arquitetura sem necessidade nesta escala.
- **SPA com React Router:** simples para esta experiência e compatível com PWA. SEO de conteúdo público seria mais forte com renderização no servidor, possível evolução futura.
- **Banco relacional:** relações e unicidade de likes/follows são naturais no PostgreSQL e protegidas por constraints transacionais.
- **RLS como defesa principal:** autorização permanece válida mesmo se alguém ignorar a interface. O custo é testar policies para cada operação e papel.

## Onde estudar primeiro

Para entender o sistema, siga esta ordem:

1. migration em `supabase/migrations/`;
2. criação do cliente em `src/lib/`;
3. provider/hook de autenticação;
4. configuração de rotas e guard privado;
5. services e hooks de posts/feed;
6. componente de post e mutations de like;
7. perfil/follows e comentários;
8. consultas do dashboard;
9. configuração PWA no Vite.
