# Notas para entrevistas — Nexo

Este arquivo é um roteiro de estudo, não um conjunto de frases para decorar. Para cada pergunta, entenda o mecanismo, abra os arquivos relacionados e explique apenas o que você conseguir demonstrar no código e no SQL.

## Como apresentar o projeto em um minuto

Uma apresentação honesta pode cobrir quatro pontos:

1. **Problema:** construir uma rede social funcional e responsiva, não apenas uma tela com mocks.
2. **Solução:** React/TypeScript no frontend e Supabase para Auth, PostgreSQL e Storage.
3. **Decisão central:** autorização com RLS e integridade com constraints, porque esconder ações na interface não protege dados.
4. **Resultado técnico:** autenticação persistente, conteúdo e relações sociais reais, dashboard derivado do banco e PWA instalável.

Depois, escolha um fluxo que você conhece bem — publicar, curtir ou seguir — e descreva o caminho completo da interface até o banco.

## Perguntas sobre arquitetura

### Por que você escolheu React, TypeScript e Vite?

React ajuda a compor telas e estados interativos; TypeScript torna contratos entre componentes, services e respostas do banco verificáveis; Vite oferece desenvolvimento e build simples. A resposta mais importante não é listar ferramentas, mas mostrar como tipos evitam que um componente suponha campos que a consulta não entrega.

### Como o frontend está organizado?

Explique a separação entre páginas/layouts, componentes visuais, hooks, services, cliente de infraestrutura e tipos. Mostre um fluxo real. Por exemplo: a página de feed chama um hook do TanStack Query, o hook chama um service, o service usa o cliente Supabase e o componente recebe um resultado tipado.

### Por que não usou Redux?

O estado compartilhado principal é dado remoto. TanStack Query já resolve cache, carregamento, erro, invalidação e mutations. Sessão e tema são estados pequenos e específicos. Redux poderia ser útil se surgisse estado cliente complexo e global, mas nesta versão aumentaria conceitos e sincronização sem resolver um problema real.

### Como você evita componentes gigantes?

Rotas coordenam a tela; cards e formulários têm responsabilidades visuais limitadas; consultas ficam em services/hooks; diálogos e estados de erro/vazio são reutilizáveis. Prepare-se para abrir um componente e apontar onde a responsabilidade termina.

## Perguntas sobre autenticação

### Como você implementou autenticação?

Supabase Auth valida e mantém a identidade. O frontend cadastra/faz login com e-mail e senha, restaura a sessão na inicialização e observa mudanças de autenticação. O trigger `on_auth_user_created` chama `handle_new_user()` para criar o registro 1:1 em `profiles` com os metadados do cadastro.

Estude a diferença entre “usuário existe no Auth” e “perfil público existe no banco”. Também saiba explicar o comportamento quando confirmação de e-mail está habilitada.

### Como a sessão continua após recarregar a página?

O cliente Supabase persiste a sessão e a recupera ao iniciar. O guard da rota precisa esperar essa recuperação; se tratasse o estado inicial como “deslogado”, poderia redirecionar incorretamente antes de a leitura terminar.

### Proteger uma rota no React é suficiente?

Não. O guard impede acesso acidental pela interface e melhora a navegação. Um usuário ainda pode chamar a API diretamente. RLS no PostgreSQL é a proteção que decide se a operação sobre cada linha é autorizada.

### Por que existe uma tabela `profiles` se o Supabase já tem `auth.users`?

`auth.users` é uma estrutura de autenticação e não deve ser usada como tabela pública de produto. `profiles` contém nome, username, bio, avatar e capa, pode ser consultada conforme as policies públicas e mantém uma relação 1:1 com a identidade. O cliente só recebe grant para atualizar nome, bio, `avatar_url` e `cover_url`; username fica imutável depois do cadastro.

## Perguntas sobre Supabase e segurança

### Por que utilizar Supabase?

Ele fornece Auth, PostgreSQL, API de dados, Storage e RLS integrados. Isso permite uma base full stack com pouca infraestrutura própria. O trade-off é que a equipe precisa modelar policies corretamente e fica acoplada a partes da plataforma, embora o núcleo de dados continue sendo PostgreSQL.

### O que é Row Level Security?

RLS são policies avaliadas pelo PostgreSQL para cada operação e usuário. Elas restringem linhas com base no token/sessão. No Nexo, `auth.uid()` é comparado ao proprietário da linha. Saiba distinguir `USING`, que filtra linhas existentes, de `WITH CHECK`, que valida o conteúdo inserido ou atualizado.

### Como você impede alguém de apagar o post de outra pessoa?

Há duas camadas: a interface mostra excluir apenas para o autor, mas a policy de `DELETE` permite a operação somente se `author_id = auth.uid()`. A segunda camada é a garantia de segurança; a primeira é experiência do usuário.

### A Publishable Key estar no frontend é um vazamento?

A Publishable Key foi feita para uso em clientes e não concede privilégios de administrador. As permissões efetivas vêm da sessão, dos papéis e de RLS. Secret Keys e credenciais associadas a `service_role` jamais podem ser enviadas ao navegador ou colocadas em `VITE_*`. O papel PostgreSQL `anon` ainda existe para requisições sem sessão, mas não é o nome da chave configurada no frontend.

### O que constraints fazem que RLS não faz?

RLS decide quem pode executar uma operação. Constraints garantem que o estado resultante é válido para todos: foreign keys impedem referências inexistentes, `unique` impede duplicidade, `check` impede auto-follow e `not null` exige campos. São camadas complementares.

### Como você testaria as policies?

Crie pelo menos dois usuários e teste leitura e escrita com cada sessão: A não pode editar o perfil de B, apagar post/comentário de B, nem remover like/follow criado por B. Teste também usuário anônimo. O ideal é automatizar esses cenários em integração; testes manuais no painel não substituem uma suíte no longo prazo.

## Perguntas sobre modelagem

### Como funciona a relação entre usuários e posts?

Um perfil pode ter muitos posts; cada post referencia um autor por foreign key e pode ter até quatro linhas ordenadas em `post_media`. Ao consultar o feed, a query combina post, campos públicos do perfil e mídia. Na criação, a RPC deriva o autor de `auth.uid()` em vez de confiar em um UUID enviado como autoria pelo cliente.

### Por que não guardar quatro URLs diretamente em `posts`?

Quatro colunas fixas misturariam conteúdo e anexos, repetiriam campos e dificultariam representar ordem, dimensões, MIME e texto alternativo. Uma linha por item em `post_media` permite constraints próprias, mantém a relação 1:N explícita e deixa `storage_path` como referência estável; a URL pública é derivada do bucket. A posição limitada de 0 a 3 preserva o máximo atual de quatro imagens.

### Como impedir mídia em nome de outro usuário?

O navegador envia conteúdo e metadados, mas a RPC usa `auth.uid()` para preencher `posts.author_id` e `post_media.owner_id`. A foreign key composta exige que dono e autor coincidam, RLS restringe insert/delete de mídia ao proprietário e a policy do Storage exige o primeiro diretório igual ao UUID autenticado; a leitura acompanha a visibilidade pública do post. O path também incorpora o UUID do post, e o browser não pode contornar o fluxo inserindo diretamente em `posts` ou escrevendo na coluna legada `image_url`.

### O que acontece em uma falha parcial?

Storage e PostgreSQL não compartilham uma transação. Na criação, os uploads acontecem antes da RPC; se um upload falhar, os anteriores são removidos, e se a RPC falhar após os uploads, o cliente confirma se o post existe antes de limpar. A RPC torna atômica apenas a parte de banco: `posts` e `post_media` entram juntos ou não entram. Se nem a verificação for conclusiva, a aplicação pede para recarregar em vez de arriscar excluir mídia válida. Na exclusão, o banco é removido primeiro e faz cascade dos metadados; a limpeza posterior do Storage é best-effort e uma falha gera aviso sem fingir que o post ainda existe.

### Como implementou curtidas sem duplicação?

`likes` representa a relação N:N entre perfil e post. O par usuário/post possui constraint única. Mesmo que duas requisições concorram, o banco aceita no máximo uma. Desabilitar o botão ajuda a UX, mas não resolve concorrência como a constraint resolve.

### Como funciona seguir outro usuário?

`follows` tem `follower_id` e `following_id`, ambos referenciando perfis. É uma relação direcionada. Uma constraint única impede repetir o par e uma constraint de diferença impede seguir a si mesmo. RLS permite criar/remover somente relações cujo `follower_id` é o usuário da sessão.

### Como funcionam comentários?

Cada comentário referencia autor e post. A leitura acompanha a página da publicação. O usuário autenticado cria somente em seu nome; o autor remove o próprio comentário. A exclusão do post segue o comportamento de cascata definido no schema para não deixar comentários órfãos.

### Por que usar `ON DELETE CASCADE` em algumas relações?

Dados sem significado fora do pai — por exemplo, like de um post removido — não devem ficar órfãos. Cascade delega essa limpeza ao banco de modo transacional. Não deve ser usado sem análise em dados que precisam de retenção/auditoria.

### Como o username é garantido como único?

A interface consulta previamente para dar feedback rápido, mas somente a constraint única no banco resolve concorrência. Duas tentativas simultâneas não podem confiar em “consultei e estava disponível”. Se ainda ocorrer uma disputa entre a consulta e o cadastro, o formulário apresenta o erro devolvido pelo Supabase.

## Perguntas sobre dados e estado

### Qual é o papel do TanStack Query?

Ele gerencia o ciclo de vida do estado remoto: query keys, cache, loading, erro, refetch e invalidação após mutation. Isso evita copiar respostas do Supabase manualmente para um store. Saiba apontar quais queries são invalidadas depois de publicar, curtir, comentar ou seguir.

### Como funciona uma atualização otimista de curtida?

Antes de a requisição terminar, o hook cancela as queries afetadas, guarda snapshots e atualiza `likedByMe` e `likeCount` no cache do feed, da lista de publicações do perfil e do post individual. Se a operação falhar, os valores anteriores são restaurados e o card exibe feedback de erro. Ao final, as queries são revalidadas para convergir com o banco.

Não afirme que todas as mutations são otimistas: confirme quais realmente usam esse padrão no código.

### Como o dashboard evita inventar dados?

Contagens e séries são calculadas a partir das tabelas do usuário e das interações recebidas em seus posts. Recharts apenas apresenta a série. Quando não há eventos, a tela mostra zero/estado vazio em vez de preencher o gráfico com dados fictícios.

### Como você trata loading, vazio e erro?

São estados distintos. Loading pode usar skeleton; uma consulta bem-sucedida sem linhas mostra uma ação contextual; falha mostra mensagem e possível retry; recurso inexistente mostra 404/não encontrado. Durante mutations, ações são bloqueadas quando a repetição seria problemática.

## Perguntas sobre busca, mídia de perfil e PWA

### Como a busca de usuários funciona?

O termo vem da query string, é sanitizado e enviado como filtro PostgREST para nome/username. O código não monta nem executa SQL bruto vindo do navegador. A consulta limita campos públicos e os resultados direcionam ao perfil.

### Como funciona o upload de avatar?

O arquivo final vai para o bucket público `avatars`; o perfil guarda somente a URL pública. O primeiro diretório é o UUID autenticado, e as policies limitam insert/update/delete a essa pasta. Novos uploads aceitam JPEG, PNG, WebP e AVIF até 5 MiB; todos passam pelo crop e geram WebP de 512 × 512. GIFs de avatar já armazenados continuam sendo exibidos, mas a interface e a configuração final do bucket recusam novos uploads desse tipo.

### Como o crop de avatar e capa funciona?

`react-easy-crop` administra posição, zoom e área selecionada. Na confirmação de uma imagem estática, o navegador desenha apenas essa região em canvas e gera um WebP otimizado: 512 × 512 para avatar e 1500 × 500, na proporção 3:1, para capa. Somente esse resultado é enviado ao Storage; cancelar o diálogo não inicia upload. Se o navegador não conseguir decodificar a origem ou codificar WebP, o editor informa o erro em vez de rotular outro formato incorretamente.

### Como GIF é tratado em avatar e capa?

Um fluxo simples de canvas trabalha com uma imagem estática e perderia os frames da animação. Por isso, GIF novo não é aceito como avatar; avatares GIF legados ainda aparecem porque suas URLs continuam válidas. Em capas, GIF é permitido até 8 MiB, recebe preview e confirmação e é enviado no formato original, sem crop ou conversão. Capas JPEG, PNG, WebP e AVIF continuam usando crop 3:1 e saída WebP.

### Como funciona a seleção pela área de transferência?

Há botões próprios para ler uma imagem copiada como avatar ou capa; a aplicação não monitora o clipboard silenciosamente. O clique chama a Clipboard API, extrai um item de imagem e o envia para a mesma validação e preparação do seletor de arquivos. A interface apresenta mensagens diferentes quando a API não é suportada, o acesso é negado ou não há imagem disponível. Suporte e permissão dependem do navegador e de um contexto seguro.

### `prefers-reduced-motion` pausa GIF animado?

Não. CSS pode reduzir animações e transições da interface, mas um GIF dentro de `<img>` continua sendo reproduzido pelo navegador. Pausá-lo exigiria processamento dos frames ou uma versão estática alternativa. Essa limitação vale para GIFs legados de avatar e para capas GIF nesta versão e deve ser explicada, não mascarada.

### Como as capas são protegidas?

O bucket público `covers` aceita JPEG, PNG, WebP, AVIF e GIF de até 8 MiB para leitura pública. Cada objeto fica em `<auth.uid()>/<arquivo>`, e as policies permitem insert, update e delete somente quando a pasta pertence à sessão. RLS permite alterar `cover_url` apenas no próprio perfil, e grants específicos mantêm `username`, `id` e timestamps fora do alcance do cliente.

### Como a troca de mídia evita perder a imagem nova?

A ordem é upload novo, atualização da URL no perfil e, por último, tentativa de excluir o arquivo antigo. Se a atualização do perfil falhar, o service tenta limpar o upload novo e então propaga o erro. Se apenas a limpeza antiga falhar, a imagem já aplicada é mantida e a interface apresenta um aviso, não uma mensagem enganosa de falha total. A remoção só alcança URLs reconhecidas como pertencentes ao projeto, ao bucket esperado e à pasta do próprio usuário. Na remoção da capa, a URL volta a `null` antes dessa limpeza best-effort do objeto anterior.

### Por que alterar a capa não revalida o feed?

TanStack Query invalida `current-profile` e perfis visitados em toda atualização. Avatar e nome também aparecem em feeds, post individual, comentários, posts do autor, busca e sugestões, então essas consultas são revalidadas quando um desses campos muda. Capa não aparece nesses conteúdos; quando somente ela muda, invalidar os feeds geraria tráfego sem mudar a interface.

### Como você transformou o site em PWA?

O manifest mantido em `public/` é copiado para o build, e o plugin gera o service worker com cache dos assets compilados. Isso permite instalação e melhora o carregamento do shell. Operações sociais ainda precisam de rede; implementar mutations offline exigiria fila, idempotência e resolução de conflitos.

### Como você testa a PWA?

Gere o build e sirva com preview/HTTPS em um ambiente compatível. Verifique manifest, ícones, registro e atualização do service worker, instalação e comportamento quando assets estão em cache. O modo de desenvolvimento sozinho não representa fielmente produção.

## Perguntas sobre qualidade e evolução

### Como você lidou com responsividade?

Não apenas reduzindo o desktop. O layout troca sidebar por navegação mobile, preserva alvos de toque e mantém feed legível em larguras menores. Mostre os breakpoints e explique uma decisão concreta de composição.

### Que cuidados de acessibilidade foram tomados?

Inputs têm labels, ações usam elementos nativos e o CSS define foco visível. Imagens usam o texto alternativo persistido quando disponível; sem ele, não é inventada uma descrição, e o controle que abre a mídia mantém um nome acessível. O diálogo de confirmação usa `alertdialog`, recebe foco inicial e fecha com Escape. O editor de imagem também possui título e descrição, contém o foco, devolve-o ao gatilho, fecha com Escape e permite reposicionar o crop com teclado depois de aplicar zoom. O diálogo de confirmação genérico ainda não possui focus trap/retorno de foco, e não há auditoria formal de contraste; esses pontos devem ser validados antes de produção.

### Qual foi o maior trade-off da primeira versão?

Uma resposta consistente é a escolha por acesso direto ao Supabase com RLS: reduz backend próprio e acelera entrega, mas exige rigor nas policies. Escolha o trade-off que você realmente enfrentou e mostre como reduziu o risco.

### O que você melhoraria com mais tempo?

Escolha prioridades justificáveis, como testes automatizados de RLS, paginação, realtime, observabilidade, moderação ou acessibilidade auditada. Relacione cada melhoria a um risco ou necessidade; não liste tecnologia apenas para parecer mais complexo.

### Como você levaria o projeto a uma escala maior?

Meça antes de redesenhar. Possíveis passos incluem paginação por cursor, índices verificados com `EXPLAIN`, agregações/RPCs específicas, cache controlado, processamento assíncrono, rate limiting, moderação e observabilidade. Uma resposta madura reconhece que contagens e feeds globais exigem estratégias diferentes conforme o volume.

## Checklist antes da entrevista

- Execute o projeto e refaça cadastro, login e logout.
- Crie dois usuários e teste as fronteiras de RLS.
- Leia as migrations completas e explique cada constraint importante.
- Trace no código um post com imagem do composer ao Storage, à RPC e às tabelas `posts`/`post_media`.
- Trace uma curtida da mutation, passando pelo cache, até a constraint única.
- Trace uma troca de avatar do crop client-side até o Storage, a atualização de `profiles` e a limpeza posterior.
- Explique por que GIF é recusado em novos avatares, preservado em capas e como o path pelo UUID participa da autorização.
- Saiba onde a sessão é restaurada e onde a rota é protegida.
- Confirme de onde vêm as métricas do dashboard.
- Execute `npm run lint` e `npm run build` e entenda qualquer aviso.
- Teste o layout em celular e desktop.
- Separe claramente o que já existe do que está apenas no roadmap.
