# Arquitetura do Nexo

Este documento explica a arquitetura da primeira versão do Nexo em linguagem direta. Ele deve ser lido junto do código e das migrations: nomes exatos de colunas, policies e scripts sempre têm o SQL e o `package.json` como fonte de verdade.

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
                         └─ buckets de avatars, covers e post-media
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

O UUID do perfil corresponde ao UUID do usuário autenticado. `auth.users` cuida de login; `profiles` contém `username`, nome de exibição, bio, URLs do avatar e da capa e timestamps. O username é normalizado para minúsculas, aceita de 3 a 30 letras minúsculas, números ou `_`, possui constraint de unicidade e não pode ser alterado pelo cliente. As URLs de avatar e capa são opcionais e limitadas a 2.048 caracteres. Validação prévia na interface serve apenas como feedback.

### Publicações

```text
profiles 1 ─── N posts 1 ─── N post_media
```

Cada post guarda a chave do autor, texto e timestamps; pode conter texto, até quatro imagens, uma enquete, ou texto combinado com imagens ou com uma enquete. Imagens e enquete não coexistem na mesma publicação. `post_media` mantém uma linha por imagem, com ordem entre 0 e 3, path no Storage, MIME, dimensões e texto alternativo opcional. A chave estrangeira composta (`post_id`, `owner_id`) exige que o dono da mídia também seja o autor do post, enquanto constraints de posição limitam cada publicação a quatro anexos sem criar quatro colunas de URL. Constraint triggers `deferrable initially deferred` verificam o estado final da transação: a RPC pode inserir o post antes das mídias, mas excluir diretamente o último anexo de um post sem texto é rejeitado para que ele nunca fique vazio. Um trigger anterior à exclusão bloqueia a linha do post durante a transação e serializa tentativas concorrentes de remover anexos.

O bucket público `post-media` aceita JPEG, PNG, WebP e AVIF de até 8 MiB. `storage_path` é a referência persistida e o frontend deriva a URL pública a partir do bucket; assim, o banco não duplica a configuração da origem pública. A coluna antiga `posts.image_url` permanece apenas para leitura de posts legados quando não há linhas em `post_media`. Novas criações gravam `image_url` como `null`, e o navegador não conserva grant de insert/update para essa coluna.

Antes do upload, o navegador respeita a orientação e a proporção da imagem, sem crop, reduz o maior lado para no máximo 1.920 pixels e tenta gerar WebP. Se o navegador não codificar WebP, uma imagem que não precisava ser reduzida pode manter o arquivo original; uma imagem redimensionada usa fallback JPEG ou PNG com MIME e extensão coerentes. O composer permite substituir e remover imagens antes de publicar; novas mídias não expõem edição de texto alternativo nesta versão, mas valores já armazenados continuam sendo renderizados. Feed, perfil e detalhe compartilham a mesma apresentação: uma imagem preserva sua proporção, enquanto duas a quatro usam um grid editorial; o visualizador ampliado sempre contém a imagem completa e oferece fechamento, navegação por botões e teclado e gerenciamento de foco.

Os objetos precisam existir antes da escrita no banco. O cliente gera o UUID do post, faz upload em `<auth.uid()>/<post-id>/<arquivo>` e chama `create_post_with_media()`. Essa RPC `security definer` só pode ser executada pelo papel `authenticated`, fixa um `search_path` vazio e deriva autor e proprietário de `auth.uid()`; ela cria o post e, conforme o payload, suas linhas de mídia ou de enquete na mesma transação, portanto uma falha no banco não deixa apenas metade desses registros. Se upload ou criação falhar e o banco confirmar que o post não existe, o cliente tenta remover os objetos já enviados. Quando a resposta da RPC é ambígua, ele consulta o post antes de decidir, evitando apagar mídia de uma publicação que possa ter sido criada.

Na exclusão, a ordem é inversa: o post do próprio autor é removido primeiro; foreign keys com cascade eliminam `post_media` e as relações dependentes no banco. Só depois o cliente tenta apagar os paths previamente lidos do Storage. Essa limpeza é best-effort: uma falha gera aviso, mas não apresenta como fracassada uma exclusão de banco que já ocorreu.

A migration `20260819020000_add_post_media.sql` declara tabela, constraints, bucket, policies, grants e RPC. Sua presença no repositório não significa que ela tenha sido aplicada ou validada contra um projeto Supabase remoto.

### Enquetes

```text
posts 1 ─── 0..1 polls 1 ─── 2..4 poll_options
                       └── 1 ─── N poll_votes N ─── 1 profiles
poll_options 1 ─── N poll_votes
```

`polls` guarda pergunta e `expires_at`, com no máximo uma enquete por post e uma foreign key composta que obriga seu autor a coincidir com o autor da publicação. `poll_options` mantém de duas a quatro opções ordenadas; pergunta e opções têm espaços normalizados, e opções repetidas após essa normalização e comparação case-insensitive são rejeitadas. `poll_votes` registra uma escolha por perfil; sua chave primária (`poll_id`, `user_id`) impede um segundo voto, enquanto a foreign key composta garante que a opção escolhida pertence àquela enquete. A exclusão do post remove enquete, opções e votos por cascade.

No composer, imagens e enquete são alternativas mutuamente exclusivas. A versão de quatro argumentos de `create_post_with_media()` recebe pergunta, duração e opções, deriva a autoria de `auth.uid()` e cria post, enquete e opções atomicamente; o overload de três argumentos preserva clientes de texto/mídia. A validação do banco aceita somente as durações oferecidas pela interface e também impede que escritas diretas ou concorrentes combinem `post_media` e `polls`.

O voto passa por `vote_in_poll(p_poll_id, p_option_id)`, que deriva o usuário da sessão, confere se a opção pertence à enquete e rejeita votos depois do prazo usando o relógio do banco. A interface bloqueia repetição enquanto a requisição está pendente; após o sucesso, atualiza o cache e revalida feed, post individual e posts do autor. Antes do voto são exibidas as opções; depois do voto ou da expiração, aparecem contagens e percentuais.

Não há cron job para encerrar enquetes. `expires_at` define o estado na leitura e no timer da interface, enquanto a RPC e um trigger validam novamente o prazo no momento do insert. Assim, a linha não precisa mudar de status para que novos votos sejam bloqueados.

RLS permite leitura pública de `polls` e `poll_options` vinculadas a posts existentes. O navegador não recebe escrita direta nessas tabelas nem leitura de `poll_votes`: criação e voto passam pelas RPCs autenticadas. `get_poll_summaries()` retorna agregados em lote e, quando existe sessão, somente a opção escolhida pelo próprio usuário; identidades dos demais votantes não são expostas.

A migration `20260820000000_add_post_polls.sql` declara tabelas, invariantes, RLS, grants e RPCs das enquetes. Sua presença no repositório não significa que ela tenha sido aplicada ou testada contra um projeto Supabase remoto.

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
| `profiles` | pública na API para perfil/busca | profile criado pelo trigger; update somente de `name`, `bio`, `avatar_url` e `cover_url` do próprio UUID |
| `posts` | pública conforme o produto | criação pela RPC com autor derivado de `auth.uid()`; delete somente do autor; update direto indisponível ao navegador |
| `post_media` | pública quando o post existe | insert/delete somente do dono e vinculado a post do mesmo autor; sem update pelo navegador |
| `polls` e `poll_options` | públicas quando o post existe | criação somente pela RPC autenticada; sem escrita direta pelo navegador |
| `poll_votes` | sem leitura direta; apenas agregados e a escolha do próprio usuário pela RPC | voto somente pela RPC autenticada; sem update/delete pelo navegador |
| `likes` | leitura necessária aos contadores | insert/delete somente quando usuário = `auth.uid()` |
| `comments` | pública junto à publicação | insert/update/delete somente quando autor = `auth.uid()` |
| `follows` | leitura necessária aos perfis | insert/delete somente quando seguidor = `auth.uid()` |
| Storage de avatar e capa | leitura pública da mídia | escrita limitada à pasta/objeto do próprio usuário em cada bucket |
| Storage `post-media` | leitura pública da mídia | upload/delete somente sob `<auth.uid()>/<post-id>/` |

Exemplo conceitual para exclusão de post:

```sql
using (auth.uid() = author_id)
```

Esconder o botão não oferece essa garantia. RLS oferece.

RLS e constraints têm responsabilidades diferentes. RLS responde “quem pode fazer?”, enquanto foreign keys, `unique`, `check` e `not null` respondem “este estado é válido?”. O projeto precisa das duas camadas.

## Mídia do perfil

O perfil guarda as URLs públicas em `avatar_url` e `cover_url`, não os bytes das imagens. O Storage separa a mídia em dois buckets:

- `avatars`: objetos de até 5 MiB; novos uploads aceitam JPEG, PNG, WebP e AVIF;
- `covers`: objetos de até 8 MiB; aceita JPEG, PNG, WebP, AVIF e GIF.

Essas adições estão declaradas na migration cronológica `20260819000000_add_profile_cover.sql`, que acrescenta `cover_url`, seu grant de coluna, o bucket `covers` e suas policies sem modificar a migration inicial. A migration posterior `20260819010000_adjust_profile_media_mime_types.sql` ajusta somente os limites e MIME dos dois buckets: retira GIF de novos avatares e o habilita em capas. A presença dos arquivos no repositório não significa que tenham sido aplicados ou testados em um projeto remoto.

Os dois buckets têm leitura pública. A escrita usa `<auth.uid()>/<arquivo>` e as policies de `storage.objects` restringem insert, update e delete à pasta cujo primeiro segmento coincide com o usuário autenticado. Na tabela, RLS exige que o perfil pertença à sessão, enquanto os grants limitam o cliente às colunas editáveis; `id`, `username` e timestamps continuam protegidos.

### Seleção, crop e processamento no navegador

A imagem pode vir do seletor de arquivos ou de botões específicos para avatar e capa que chamam a Clipboard API. A aplicação só consulta a área de transferência após essa ação explícita e diferencia falta de suporte do navegador, permissão negada e ausência de imagem copiada. O arquivo obtido segue as mesmas validações de MIME, tamanho e decodificação do seletor comum; usar o clipboard não contorna as regras do Storage.

A seleção de uma imagem estática não inicia o upload. Um diálogo reutilizável baseado em `react-easy-crop` permite reposicionar e ampliar a imagem. Depois da confirmação, somente a região escolhida é desenhada em canvas e convertida para WebP:

- avatar: crop quadrado, apresentado com máscara circular, saída de 512 × 512 pixels;
- capa: proporção 3:1, saída de 1500 × 500 pixels.

Esse processamento reduz dimensões e transferência sem exigir um servidor de imagens. A validação de MIME e tamanho no cliente melhora o feedback; os limites e tipos aceitos pelos buckets continuam sendo a barreira compartilhada. O navegador precisa conseguir decodificar a imagem estática e codificar WebP pelo canvas; caso contrário, o editor informa a limitação e não envia um arquivo com formato incorreto.

GIF segue uma regra específica por contexto. Um GIF escolhido para capa recebe preview e confirmação, mas não passa por crop, canvas ou conversão: o arquivo original é enviado para preservar seus frames. Novos GIFs de avatar são rejeitados tanto pela interface quanto pela configuração final do bucket `avatars`. URLs de GIFs de avatar que já existiam continuam sendo exibidas normalmente; a mudança restringe novos uploads e não apaga objetos legados.

`prefers-reduced-motion` reduz transições e animações controladas pela aplicação, mas não consegue pausar de forma nativa um GIF animado renderizado por `<img>`. Respeitar essa preferência para GIF exigiria processar os frames ou manter uma alternativa estática, algo que não faz parte desta versão.

### Upload, troca e remoção

Os arquivos recebem nomes gerados pela aplicação dentro da pasta do usuário, sem reutilizar o nome fornecido pelo arquivo local. Em uma troca, o fluxo é deliberadamente ordenado: faz upload da nova imagem, persiste sua URL em `profiles` e só então tenta excluir o objeto anterior. Se a atualização do perfil falhar depois do upload, o service tenta remover os objetos recém-enviados antes de propagar o erro. Se a limpeza de uma mídia antiga falhar, a nova mídia já aplicada não é descartada: a operação continua como sucesso com um aviso específico. Toda limpeza é best-effort e só tenta excluir uma URL que possa ser reconhecida como pertencente ao bucket, projeto Supabase e diretório do próprio usuário.

A capa pode ser removida: `cover_url` volta a `null`, o perfil recupera o padrão visual da interface e a aplicação tenta limpar o objeto anterior com a mesma cautela. As mutations de mídia impedem confirmação duplicada e só exibem sucesso depois da atualização do perfil.

O cache é revalidado de acordo com onde cada campo aparece. Toda atualização revalida `current-profile` e os perfis visitados. Quando avatar ou nome muda, também são revalidados feeds, post individual, comentários, posts do autor, busca e sugestões, pois esses resultados incorporam a identidade social. Alterar apenas a capa não invalida essas consultas, porque ela não aparece nos cards ou conteúdos sociais; assim a aplicação evita refetches sem efeito.

## Busca

O termo da URL é normalizado/sanitizado e enviado aos filtros da API do Supabase para nome e username. O código não executa SQL bruto vindo do navegador. Resultados retornam apenas os campos públicos necessários e levam à rota `/@username`.

A extensão `pg_trgm` e índices GIN em username/nome sustentam o padrão de busca por trecho. Em uma escala maior, busca textual e paginação podem substituir filtros simples.

## Tema, responsividade e acessibilidade

O tema é um estado de interface, não dado remoto. A preferência é persistida localmente e aplicada à raiz do documento; quando não existe escolha, a preferência do sistema pode ser usada como valor inicial.

O mesmo conteúdo usa navegação apropriada a cada largura: sidebar em desktop e navegação compacta no mobile. HTML semântico, labels, foco visível e botões reais mantêm a base navegável sem depender apenas do mouse. Imagens usam o texto alternativo armazenado quando ele existe; sem esse valor, os controles que abrem a mídia continuam com nomes acessíveis e a imagem usa `alt=""`, sem inventar uma descrição.

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

1. migrations em `supabase/migrations/`;
2. criação do cliente em `src/lib/`;
3. provider/hook de autenticação;
4. configuração de rotas e guard privado;
5. services e hooks de posts/feed;
6. componente de post e mutations de like;
7. perfil/follows e comentários;
8. consultas do dashboard;
9. configuração PWA no Vite.
