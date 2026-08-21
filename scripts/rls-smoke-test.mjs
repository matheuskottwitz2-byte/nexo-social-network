import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
]

const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]?.trim())

if (missingEnv.length > 0) {
  console.error(`[FAIL] Variáveis de ambiente ausentes: ${missingEnv.join(', ')}`)
  console.error('\nRLS TESTS: 0 passed / 1 failed')
  process.exitCode = 1
} else {
  await runSmokeTest()
}

async function runSmokeTest() {
  const config = {
    url: process.env.VITE_SUPABASE_URL.trim(),
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim(),
    userA: {
      email: process.env.TEST_USER_A_EMAIL.trim(),
      password: process.env.TEST_USER_A_PASSWORD,
    },
    userB: {
      email: process.env.TEST_USER_B_EMAIL.trim(),
      password: process.env.TEST_USER_B_PASSWORD,
    },
  }

  const secrets = [
    config.publishableKey,
    config.userA.email,
    config.userA.password,
    config.userB.email,
    config.userB.password,
  ]

  const clientA = createTestClient(config.url, config.publishableKey)
  const clientB = createTestClient(config.url, config.publishableKey)
  const results = []
  const runId = randomUUID()
  const temporaryPostByB = `[RLS smoke ${runId}] post temporário de B`
  const unauthorizedPostAsB = `[RLS smoke ${runId}] tentativa de A publicar como B`
  const temporaryPostByA = `[RLS smoke ${runId}] post temporário legítimo de A`
  const temporaryPollQuestionByA = `[RLS smoke ${runId}] enquete temporária de A`
  const temporaryPollQuestionByB = `[RLS smoke ${runId}] enquete temporária de B`
  const attemptedProfileName = `RLS_BLOCK_TEST_${runId.slice(0, 12)}`
  const attemptedCoverForB = `https://example.invalid/nexo-rls-smoke/${runId}/cover-b.webp`
  const temporaryCoverForA = `https://example.invalid/nexo-rls-smoke/${runId}/cover-a.webp`

  let userAId
  let userBId
  let originalUserACoverUrl
  let originalUserBName
  let originalUserBCoverUrl
  let temporaryPostByBId
  let temporaryPostByAId
  let requestedPostByAId
  let temporaryMediaByBId
  let temporaryPollByAId
  let temporaryPollByBId
  let temporaryPollOptionByAId
  let temporaryPollOptionByBId
  let alternatePollOptionByBId
  const cleanupMediaPathsForA = new Set()
  const cleanupMediaPathsForB = new Set()
  const cleanupPostIdsForA = new Set()
  const cleanupPostIdsForB = new Set()
  let userACoverSnapshotCaptured = false
  let userBCoverSnapshotCaptured = false
  let ownCoverMutationAttempted = false
  let setupComplete = false

  function redact(value) {
    let output = String(value ?? '')
    for (const secret of secrets) {
      if (secret) output = output.split(secret).join('[REDACTED]')
    }
    return output
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
      .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
      .slice(0, 400)
  }

  function errorDetail(error, fallback) {
    if (!error) return fallback
    const parts = [error.code, error.status, error.message].filter(Boolean)
    return redact(parts.join(' | ') || fallback)
  }

  function record(passed, label, options = {}) {
    const { detail, security = false } = options
    results.push({ passed, security })
    const output = `${passed ? '[PASS]' : '[FAIL]'} ${label}`
    if (passed) console.log(output)
    else console.error(detail ? `${output} — ${redact(detail)}` : output)
  }

  function isExpectedAuthorizationError(error) {
    if (!error) return false
    const status = Number(error.status)
    const message = String(error.message ?? '').toLowerCase()
    return (
      error.code === '42501' ||
      status === 401 ||
      status === 403 ||
      message.includes('row-level security') ||
      message.includes('permission denied')
    )
  }

  try {
    console.log('[INFO] Autenticando as duas contas de teste em clientes isolados...')

    const authA = await clientA.auth.signInWithPassword(config.userA)
    if (authA.error || !authA.data.user) {
      record(false, 'Não foi possível autenticar o usuário A', {
        detail: errorDetail(authA.error, 'Sessão de A não foi criada.'),
      })
      return
    }
    userAId = authA.data.user.id

    const authB = await clientB.auth.signInWithPassword(config.userB)
    if (authB.error || !authB.data.user) {
      record(false, 'Não foi possível autenticar o usuário B', {
        detail: errorDetail(authB.error, 'Sessão de B não foi criada.'),
      })
      return
    }
    userBId = authB.data.user.id

    if (userAId === userBId) {
      record(false, 'As contas A e B precisam ser usuários diferentes')
      return
    }

    console.log('[INFO] Contas autenticadas; nenhum token ou credencial será exibido.')

    const ownProfile = await clientA
      .from('profiles')
      .select('id, username, name, cover_url')
      .eq('id', userAId)
      .maybeSingle()

    record(!ownProfile.error && ownProfile.data?.id === userAId, 'A conseguiu consultar seu próprio perfil', {
      detail: errorDetail(ownProfile.error, 'O perfil de A não foi encontrado.'),
    })

    if (!ownProfile.error && ownProfile.data?.id === userAId) {
      originalUserACoverUrl = ownProfile.data.cover_url
      userACoverSnapshotCaptured = true
    }

    const userBProfile = await clientB
      .from('profiles')
      .select('id, name, cover_url')
      .eq('id', userBId)
      .maybeSingle()

    if (userBProfile.error || !userBProfile.data) {
      record(false, 'Não foi possível preparar o perfil de B para o teste', {
        detail: errorDetail(userBProfile.error, 'O perfil de B não foi encontrado.'),
      })
      return
    }
    originalUserBName = userBProfile.data.name
    originalUserBCoverUrl = userBProfile.data.cover_url
    userBCoverSnapshotCaptured = true

    // Um post temporário de B evita testar DELETE contra uma publicação preexistente.
    const requestedPostByBId = randomUUID()
    const fixturePostCreation = await clientB.rpc('create_post_with_media', {
      p_post_id: requestedPostByBId,
      p_content: temporaryPostByB,
      p_media: [],
    })

    if (fixturePostCreation.error || fixturePostCreation.data !== requestedPostByBId) {
      record(false, 'Não foi possível criar o post temporário de B', {
        detail: errorDetail(fixturePostCreation.error, 'A criação atômica legítima do fixture falhou.'),
      })
      return
    }

    const fixturePost = await clientB
      .from('posts')
      .select('id, author_id, content')
      .eq('id', requestedPostByBId)
      .maybeSingle()

    if (fixturePost.error || fixturePost.data?.author_id !== userBId) {
      record(false, 'Não foi possível confirmar o post temporário de B', {
        detail: errorDetail(fixturePost.error, 'O post criado pela RPC não pertence a B.'),
      })
      return
    }

    temporaryPostByBId = requestedPostByBId
    setupComplete = true
    console.log('[INFO] Post temporário de B criado para os testes destrutivos controlados.')

    const publicPostRead = await clientA
      .from('posts')
      .select('id, author_id, content')
      .eq('id', temporaryPostByBId)
      .maybeSingle()

    record(
      !publicPostRead.error && publicPostRead.data?.author_id === userBId,
      'A conseguiu ler post público de B',
      { detail: errorDetail(publicPostRead.error, 'O post temporário de B não ficou visível para A.') },
    )

    const unauthorizedDelete = await clientA
      .from('posts')
      .delete()
      .eq('id', temporaryPostByBId)
      .select('id')

    const postAfterDeleteAttempt = await clientB
      .from('posts')
      .select('id, author_id')
      .eq('id', temporaryPostByBId)
      .maybeSingle()

    const deleteReturnedNoRows = Array.isArray(unauthorizedDelete.data) && unauthorizedDelete.data.length === 0
    const postStillExists = !postAfterDeleteAttempt.error && postAfterDeleteAttempt.data?.id === temporaryPostByBId
    const deleteWasBlocked =
      postStillExists &&
      (deleteReturnedNoRows || isExpectedAuthorizationError(unauthorizedDelete.error))

    record(deleteWasBlocked, 'A NÃO conseguiu excluir post de B', {
      security: true,
      detail: deleteWasBlocked
        ? undefined
        : errorDetail(unauthorizedDelete.error, 'DELETE afetou uma linha ou produziu um resultado inesperado.'),
    })
    record(postStillExists, 'Post de B continua existente', {
      security: true,
      detail: errorDetail(postAfterDeleteAttempt.error, 'O post temporário de B desapareceu.'),
    })

    const unauthorizedPollInsert = await clientA
      .from('polls')
      .insert({
        post_id: temporaryPostByBId,
        author_id: userBId,
        question: `[RLS smoke ${runId}] tentativa de A criar enquete para B`,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')

    const unauthorizedPollInsertWasBlocked =
      isExpectedAuthorizationError(unauthorizedPollInsert.error) &&
      (!unauthorizedPollInsert.data || unauthorizedPollInsert.data.length === 0)

    record(unauthorizedPollInsertWasBlocked, 'A NÃO conseguiu criar enquete em post de B', {
      security: true,
      detail: unauthorizedPollInsertWasBlocked
        ? undefined
        : errorDetail(
            unauthorizedPollInsert.error,
            'O INSERT direto de enquete não foi bloqueado explicitamente por grants/RLS.',
          ),
    })

    const mediaByBPath = `${userBId}/${temporaryPostByBId}/${randomUUID()}.webp`
    cleanupMediaPathsForB.add(mediaByBPath)

    const mediaByBInsert = await clientB
      .from('post_media')
      .insert({
        post_id: temporaryPostByBId,
        owner_id: userBId,
        media_type: 'image',
        storage_path: mediaByBPath,
        mime_type: 'image/webp',
        width: 8,
        height: 8,
        position: 0,
        alt_text: 'Fixture temporário do smoke test de RLS',
      })
      .select('id, post_id, owner_id, storage_path')
      .single()

    const mediaByBWasCreated =
      !mediaByBInsert.error &&
      mediaByBInsert.data?.post_id === temporaryPostByBId &&
      mediaByBInsert.data?.owner_id === userBId

    if (mediaByBInsert.data?.id) temporaryMediaByBId = mediaByBInsert.data.id

    record(mediaByBWasCreated, 'B conseguiu preparar metadata temporária no próprio post', {
      detail: errorDetail(mediaByBInsert.error, 'O fixture de post_media de B não foi criado.'),
    })

    const spoofedOwnerMediaPath = `${userBId}/${temporaryPostByBId}/${randomUUID()}.webp`
    cleanupMediaPathsForB.add(spoofedOwnerMediaPath)

    const spoofedOwnerInsert = await clientA
      .from('post_media')
      .insert({
        post_id: temporaryPostByBId,
        owner_id: userBId,
        media_type: 'image',
        storage_path: spoofedOwnerMediaPath,
        mime_type: 'image/webp',
        width: 8,
        height: 8,
        position: 1,
        alt_text: null,
      })
      .select('id')

    const spoofedOwnerInsertWasBlocked =
      isExpectedAuthorizationError(spoofedOwnerInsert.error) &&
      (!spoofedOwnerInsert.data || spoofedOwnerInsert.data.length === 0)

    record(spoofedOwnerInsertWasBlocked, 'A NÃO conseguiu criar mídia para post de B usando owner_id de B', {
      security: true,
      detail: spoofedOwnerInsertWasBlocked
        ? undefined
        : errorDetail(spoofedOwnerInsert.error, 'O INSERT adulterado não foi bloqueado pela RLS.'),
    })

    const mismatchedOwnerMediaPath = `${userAId}/${temporaryPostByBId}/${randomUUID()}.webp`
    cleanupMediaPathsForA.add(mismatchedOwnerMediaPath)

    const mismatchedOwnerInsert = await clientA
      .from('post_media')
      .insert({
        post_id: temporaryPostByBId,
        owner_id: userAId,
        media_type: 'image',
        storage_path: mismatchedOwnerMediaPath,
        mime_type: 'image/webp',
        width: 8,
        height: 8,
        position: 2,
        alt_text: null,
      })
      .select('id')

    const mismatchedOwnerInsertWasRejected =
      Boolean(mismatchedOwnerInsert.error) &&
      (!mismatchedOwnerInsert.data || mismatchedOwnerInsert.data.length === 0)

    record(mismatchedOwnerInsertWasRejected, 'A NÃO conseguiu vincular sua mídia ao post de B', {
      security: true,
      detail: mismatchedOwnerInsertWasRejected
        ? undefined
        : errorDetail(
            mismatchedOwnerInsert.error,
            'O vínculo incompatível entre owner_id e autor do post foi aceito.',
          ),
    })

    if (temporaryMediaByBId) {
      const unauthorizedMediaDelete = await clientA
        .from('post_media')
        .delete()
        .eq('id', temporaryMediaByBId)
        .select('id')

      const mediaAfterDeleteAttempt = await clientB
        .from('post_media')
        .select('id, post_id, owner_id, storage_path')
        .eq('id', temporaryMediaByBId)
        .maybeSingle()

      const mediaDeleteReturnedNoRows =
        Array.isArray(unauthorizedMediaDelete.data) && unauthorizedMediaDelete.data.length === 0
      const mediaByBStillExists =
        !mediaAfterDeleteAttempt.error &&
        mediaAfterDeleteAttempt.data?.id === temporaryMediaByBId &&
        mediaAfterDeleteAttempt.data?.owner_id === userBId
      const mediaDeleteWasBlocked =
        mediaByBStillExists &&
        (mediaDeleteReturnedNoRows || isExpectedAuthorizationError(unauthorizedMediaDelete.error))

      record(mediaDeleteWasBlocked, 'A NÃO conseguiu excluir metadata de mídia de B', {
        security: true,
        detail: mediaDeleteWasBlocked
          ? undefined
          : errorDetail(
              unauthorizedMediaDelete.error,
              'DELETE de post_media afetou uma linha ou produziu um resultado inesperado.',
            ),
      })
      record(mediaByBStillExists, 'Metadata de mídia de B continua existente', {
        security: true,
        detail: errorDetail(
          mediaAfterDeleteAttempt.error,
          'A metadata temporária de B desapareceu após a tentativa de A.',
        ),
      })
    } else {
      record(false, 'A NÃO conseguiu excluir metadata de mídia de B', {
        security: true,
        detail: 'O fixture de post_media de B não pôde ser criado.',
      })
      record(false, 'Metadata de mídia de B continua existente', {
        security: true,
        detail: 'Não havia metadata de B para confirmar.',
      })
    }

    const pollPostByBId = randomUUID()
    cleanupPostIdsForB.add(pollPostByBId)
    const pollCreationByB = await clientB.rpc('create_post_with_media', {
      p_post_id: pollPostByBId,
      p_content: '',
      p_media: [],
      p_poll: {
        question: temporaryPollQuestionByB,
        duration_minutes: 60,
        options: ['Opção B1', 'Opção B2'],
      },
    })

    const pollSummaryByB = pollCreationByB.error
      ? { data: null, error: pollCreationByB.error }
      : await clientA.rpc('get_poll_summaries', { p_post_ids: [pollPostByBId] })
    const pollByB = pollSummaryByB.data?.[0]
    const pollOptionsByB = Array.isArray(pollByB?.options) ? pollByB.options : []
    temporaryPollByBId = pollByB?.poll_id
    temporaryPollOptionByBId = pollOptionsByB[0]?.id
    alternatePollOptionByBId = pollOptionsByB[1]?.id

    const emptyTextPollByBWasCreated =
      !pollCreationByB.error &&
      pollCreationByB.data === pollPostByBId &&
      !pollSummaryByB.error &&
      pollByB?.post_id === pollPostByBId &&
      pollByB?.question === temporaryPollQuestionByB &&
      pollOptionsByB.length === 2 &&
      Number(pollByB?.total_votes) === 0

    record(emptyTextPollByBWasCreated, 'B conseguiu criar enquete sem texto e A leu o resumo público', {
      detail: errorDetail(
        pollCreationByB.error ?? pollSummaryByB.error,
        'A criação ou a leitura agregada da enquete de B não foi confirmada.',
      ),
    })

    if (temporaryPollByBId) {
      const unauthorizedPollDelete = await clientA
        .from('polls')
        .delete()
        .eq('id', temporaryPollByBId)
        .select('id')
      const pollAfterDeleteAttempt = await clientB.rpc('get_poll_summaries', {
        p_post_ids: [pollPostByBId],
      })
      const pollByBStillExists =
        !pollAfterDeleteAttempt.error &&
        pollAfterDeleteAttempt.data?.[0]?.poll_id === temporaryPollByBId
      const unauthorizedPollDeleteWasBlocked =
        pollByBStillExists &&
        isExpectedAuthorizationError(unauthorizedPollDelete.error) &&
        (!unauthorizedPollDelete.data || unauthorizedPollDelete.data.length === 0)

      record(unauthorizedPollDeleteWasBlocked, 'A NÃO conseguiu excluir enquete de B', {
        security: true,
        detail: unauthorizedPollDeleteWasBlocked
          ? undefined
          : errorDetail(
              unauthorizedPollDelete.error ?? pollAfterDeleteAttempt.error,
              'A enquete de B foi excluída ou o DELETE não foi bloqueado explicitamente.',
            ),
      })
    } else {
      record(false, 'A NÃO conseguiu excluir enquete de B', {
        security: true,
        detail: 'O fixture de enquete de B não pôde ser preparado.',
      })
    }

    const pollPostByAId = randomUUID()
    cleanupPostIdsForA.add(pollPostByAId)
    const pollCreationByA = await clientA.rpc('create_post_with_media', {
      p_post_id: pollPostByAId,
      p_content: '',
      p_media: [],
      p_poll: {
        question: temporaryPollQuestionByA,
        duration_minutes: 60,
        options: ['Opção A1', 'Opção A2'],
      },
    })

    const pollSummaryByA = pollCreationByA.error
      ? { data: null, error: pollCreationByA.error }
      : await clientA.rpc('get_poll_summaries', { p_post_ids: [pollPostByAId] })
    const pollByA = pollSummaryByA.data?.[0]
    const pollOptionsByA = Array.isArray(pollByA?.options) ? pollByA.options : []
    temporaryPollByAId = pollByA?.poll_id
    temporaryPollOptionByAId = pollOptionsByA[0]?.id

    const ownPollWasCreated =
      !pollCreationByA.error &&
      pollCreationByA.data === pollPostByAId &&
      !pollSummaryByA.error &&
      pollByA?.post_id === pollPostByAId &&
      pollByA?.question === temporaryPollQuestionByA &&
      pollOptionsByA.length === 2

    record(ownPollWasCreated, 'A conseguiu criar enquete legítima no próprio post', {
      detail: errorDetail(
        pollCreationByA.error ?? pollSummaryByA.error,
        'A criação atômica da enquete de A não foi confirmada.',
      ),
    })

    if (temporaryPollOptionByAId) {
      const attemptedOptionText = `[RLS smoke ${runId}] opção alterada`
      const immutableOptionUpdate = await clientA
        .from('poll_options')
        .update({ option_text: attemptedOptionText })
        .eq('id', temporaryPollOptionByAId)
        .select('id, option_text')
      const pollAfterOptionUpdate = await clientA.rpc('get_poll_summaries', {
        p_post_ids: [pollPostByAId],
      })
      const optionsAfterUpdate = pollAfterOptionUpdate.data?.[0]?.options
      const optionAfterUpdate = Array.isArray(optionsAfterUpdate)
        ? optionsAfterUpdate.find((option) => option.id === temporaryPollOptionByAId)
        : undefined
      const updateReturnedNoRows =
        Array.isArray(immutableOptionUpdate.data) && immutableOptionUpdate.data.length === 0
      const immutableOptionWasProtected =
        !pollAfterOptionUpdate.error &&
        optionAfterUpdate?.text === 'Opção A1' &&
        (isExpectedAuthorizationError(immutableOptionUpdate.error) || updateReturnedNoRows)

      record(immutableOptionWasProtected, 'A NÃO conseguiu alterar opções depois da publicação', {
        security: true,
        detail: immutableOptionWasProtected
          ? undefined
          : errorDetail(
              immutableOptionUpdate.error ?? pollAfterOptionUpdate.error,
              'Uma opção publicada foi alterada ou o bloqueio retornou um resultado inesperado.',
            ),
      })
    } else {
      record(false, 'A NÃO conseguiu alterar opções depois da publicação', {
        security: true,
        detail: 'O fixture de opção de A não pôde ser preparado.',
      })
    }

    const mediaForPollPath = `${userAId}/${pollPostByAId}/${randomUUID()}.webp`
    cleanupMediaPathsForA.add(mediaForPollPath)
    const directMediaForPoll = await clientA
      .from('post_media')
      .insert({
        post_id: pollPostByAId,
        owner_id: userAId,
        media_type: 'image',
        storage_path: mediaForPollPath,
        mime_type: 'image/webp',
        width: 8,
        height: 8,
        position: 0,
        alt_text: null,
      })
      .select('id')
    const mediaForPollAfterAttempt = await clientA
      .from('post_media')
      .select('id')
      .eq('storage_path', mediaForPollPath)
      .maybeSingle()
    const directMediaForPollWasBlocked =
      directMediaForPoll.error?.code === '23514' &&
      (!directMediaForPoll.data || directMediaForPoll.data.length === 0) &&
      !mediaForPollAfterAttempt.error &&
      !mediaForPollAfterAttempt.data

    record(directMediaForPollWasBlocked, 'Write direto NÃO conseguiu adicionar mídia a post com enquete', {
      security: true,
      detail: directMediaForPollWasBlocked
        ? undefined
        : errorDetail(
            directMediaForPoll.error ?? mediaForPollAfterAttempt.error,
            'O trigger de exclusividade não bloqueou o INSERT direto de post_media.',
          ),
    })

    const mixedPostId = randomUUID()
    cleanupPostIdsForA.add(mixedPostId)
    const mixedMediaPath = `${userAId}/${mixedPostId}/${randomUUID()}.webp`
    cleanupMediaPathsForA.add(mixedMediaPath)
    const mixedPostCreation = await clientA.rpc('create_post_with_media', {
      p_post_id: mixedPostId,
      p_content: 'Tentativa controlada de combinar mídia e enquete',
      p_media: [{
        storage_path: mixedMediaPath,
        mime_type: 'image/webp',
        width: 8,
        height: 8,
        position: 0,
        alt_text: null,
      }],
      p_poll: {
        question: 'Esta combinação deve falhar?',
        duration_minutes: 60,
        options: ['Sim', 'Não'],
      },
    })
    const mixedPostAfterAttempt = await clientA
      .from('posts')
      .select('id')
      .eq('id', mixedPostId)
      .maybeSingle()
    const mixedPostWasRejected =
      Boolean(mixedPostCreation.error) &&
      !mixedPostAfterAttempt.error &&
      !mixedPostAfterAttempt.data

    record(mixedPostWasRejected, 'A NÃO conseguiu combinar mídia e enquete no mesmo post', {
      security: true,
      detail: mixedPostWasRejected
        ? undefined
        : errorDetail(
            mixedPostCreation.error ?? mixedPostAfterAttempt.error,
            'A criação atômica aceitou mídia e enquete juntas ou deixou um post parcial.',
          ),
    })

    const invalidOptionCountPostId = randomUUID()
    cleanupPostIdsForA.add(invalidOptionCountPostId)
    const invalidOptionCountCreation = await clientA.rpc('create_post_with_media', {
      p_post_id: invalidOptionCountPostId,
      p_content: '',
      p_media: [],
      p_poll: {
        question: 'Enquete inválida com uma opção',
        duration_minutes: 60,
        options: ['Única opção'],
      },
    })
    const invalidOptionCountPost = await clientA
      .from('posts')
      .select('id')
      .eq('id', invalidOptionCountPostId)
      .maybeSingle()
    const invalidOptionCountWasRejected =
      Boolean(invalidOptionCountCreation.error) &&
      !invalidOptionCountPost.error &&
      !invalidOptionCountPost.data

    record(invalidOptionCountWasRejected, 'Enquete com menos de duas opções foi rejeitada atomicamente', {
      detail: invalidOptionCountWasRejected
        ? undefined
        : errorDetail(
            invalidOptionCountCreation.error ?? invalidOptionCountPost.error,
            'A enquete inválida foi aceita ou deixou um post parcial.',
          ),
    })

    const duplicateNormalizedOptionsPostId = randomUUID()
    cleanupPostIdsForA.add(duplicateNormalizedOptionsPostId)
    const duplicateNormalizedOptionsCreation = await clientA.rpc('create_post_with_media', {
      p_post_id: duplicateNormalizedOptionsPostId,
      p_content: '',
      p_media: [],
      p_poll: {
        question: 'Enquete inválida com opções equivalentes',
        duration_minutes: 60,
        options: ['A  B', 'a b'],
      },
    })
    const duplicateNormalizedOptionsPost = await clientA
      .from('posts')
      .select('id')
      .eq('id', duplicateNormalizedOptionsPostId)
      .maybeSingle()
    const duplicateNormalizedOptionsWereRejected =
      Boolean(duplicateNormalizedOptionsCreation.error) &&
      !duplicateNormalizedOptionsPost.error &&
      !duplicateNormalizedOptionsPost.data

    record(
      duplicateNormalizedOptionsWereRejected,
      'Opções equivalentes após normalizar espaços e caixa foram rejeitadas atomicamente',
      {
        detail: duplicateNormalizedOptionsWereRejected
          ? undefined
          : errorDetail(
              duplicateNormalizedOptionsCreation.error ?? duplicateNormalizedOptionsPost.error,
              'A enquete aceitou opções duplicadas após normalização ou deixou um post parcial.',
            ),
      },
    )

    if (
      temporaryPollByAId &&
      temporaryPollByBId &&
      temporaryPollOptionByBId &&
      alternatePollOptionByBId &&
      temporaryPollOptionByAId
    ) {
      const wrongPollOptionVote = await clientA.rpc('vote_in_poll', {
        p_poll_id: temporaryPollByBId,
        p_option_id: temporaryPollOptionByAId,
      })
      const wrongPollOptionWasRejected =
        Boolean(wrongPollOptionVote.error) && wrongPollOptionVote.data == null

      record(wrongPollOptionWasRejected, 'A NÃO conseguiu votar usando opção de outra enquete', {
        security: true,
        detail: wrongPollOptionWasRejected
          ? undefined
          : errorDetail(
              wrongPollOptionVote.error,
              'vote_in_poll aceitou uma opção que não pertence à enquete.',
            ),
      })

      const legitimateVote = await clientA.rpc('vote_in_poll', {
        p_poll_id: temporaryPollByBId,
        p_option_id: temporaryPollOptionByBId,
      })
      const legitimateVoteWasCreated =
        !legitimateVote.error && legitimateVote.data === temporaryPollOptionByBId

      record(legitimateVoteWasCreated, 'A conseguiu votar uma vez em opção válida de B', {
        detail: errorDetail(legitimateVote.error, 'O voto legítimo não foi criado.'),
      })

      const secondVote = await clientA.rpc('vote_in_poll', {
        p_poll_id: temporaryPollByBId,
        p_option_id: alternatePollOptionByBId,
      })
      const secondVoteWasRejected =
        secondVote.error?.code === '23505' && secondVote.data == null

      record(secondVoteWasRejected, 'A NÃO conseguiu trocar ou repetir seu voto definitivo', {
        security: true,
        detail: secondVoteWasRejected
          ? undefined
          : errorDetail(secondVote.error, 'Um segundo voto foi aceito ou falhou por motivo inesperado.'),
      })

      const summaryAfterVote = await clientA.rpc('get_poll_summaries', {
        p_post_ids: [pollPostByBId],
      })
      const confirmedSummary = summaryAfterVote.data?.[0]
      const voteSummaryIsCorrect =
        !summaryAfterVote.error &&
        confirmedSummary?.viewer_option_id === temporaryPollOptionByBId &&
        Number(confirmedSummary?.total_votes) === 1

      record(voteSummaryIsCorrect, 'Resumo agregado mostra o único voto de A sem expor eleitores', {
        detail: errorDetail(
          summaryAfterVote.error,
          'O total ou a opção escolhida pelo usuário atual ficou inconsistente.',
        ),
      })

      const forgedVote = await clientA
        .from('poll_votes')
        .insert({
          poll_id: temporaryPollByBId,
          option_id: alternatePollOptionByBId,
          user_id: userBId,
        })
        .select('poll_id')
      const forgedVoteWasBlocked =
        isExpectedAuthorizationError(forgedVote.error) &&
        (!forgedVote.data || forgedVote.data.length === 0)

      record(forgedVoteWasBlocked, 'A NÃO conseguiu votar em nome de B', {
        security: true,
        detail: forgedVoteWasBlocked
          ? undefined
          : errorDetail(forgedVote.error, 'O INSERT direto adulterado não foi bloqueado.'),
      })

      const summaryAfterForgery = await clientA.rpc('get_poll_summaries', {
        p_post_ids: [pollPostByBId],
      })
      const forgedVoteDidNotChangeTotal =
        !summaryAfterForgery.error && Number(summaryAfterForgery.data?.[0]?.total_votes) === 1

      record(forgedVoteDidNotChangeTotal, 'Tentativa de voto adulterado não alterou o total', {
        security: true,
        detail: errorDetail(
          summaryAfterForgery.error,
          'O total de votos mudou depois do INSERT adulterado.',
        ),
      })

      const exposedVoters = await clientA
        .from('poll_votes')
        .select('poll_id, option_id, user_id')
        .eq('poll_id', temporaryPollByBId)
      const voterIdentitiesArePrivate =
        isExpectedAuthorizationError(exposedVoters.error) &&
        (!exposedVoters.data || exposedVoters.data.length === 0)

      record(voterIdentitiesArePrivate, 'Identidades dos eleitores NÃO são legíveis pelo cliente', {
        security: true,
        detail: voterIdentitiesArePrivate
          ? undefined
          : errorDetail(exposedVoters.error, 'A tabela poll_votes expôs identidades ao navegador.'),
      })
    } else {
      for (const label of [
        'A NÃO conseguiu votar usando opção de outra enquete',
        'A conseguiu votar uma vez em opção válida de B',
        'A NÃO conseguiu trocar ou repetir seu voto definitivo',
        'Resumo agregado mostra o único voto de A sem expor eleitores',
        'A NÃO conseguiu votar em nome de B',
        'Tentativa de voto adulterado não alterou o total',
        'Identidades dos eleitores NÃO são legíveis pelo cliente',
      ]) {
        record(false, label, {
          security: label.includes('NÃO') || label.includes('Identidades'),
          detail: 'Os fixtures de enquete não puderam ser preparados.',
        })
      }
    }

    const unauthorizedProfileUpdate = await clientA
      .from('profiles')
      .update({ name: attemptedProfileName })
      .eq('id', userBId)
      .select('id, name')

    const profileAfterUpdateAttempt = await clientB
      .from('profiles')
      .select('id, name')
      .eq('id', userBId)
      .maybeSingle()

    const updateReturnedNoRows =
      Array.isArray(unauthorizedProfileUpdate.data) && unauthorizedProfileUpdate.data.length === 0
    const profileNameIsIntact =
      !profileAfterUpdateAttempt.error && profileAfterUpdateAttempt.data?.name === originalUserBName
    const updateWasBlocked =
      profileNameIsIntact &&
      (updateReturnedNoRows || isExpectedAuthorizationError(unauthorizedProfileUpdate.error))

    record(updateWasBlocked, 'A NÃO conseguiu alterar perfil de B', {
      security: true,
      detail: updateWasBlocked
        ? undefined
        : errorDetail(unauthorizedProfileUpdate.error, 'UPDATE afetou uma linha ou produziu um resultado inesperado.'),
    })
    record(profileNameIsIntact, 'Nome original de B continua intacto', {
      security: true,
      detail: errorDetail(profileAfterUpdateAttempt.error, 'O nome de B foi alterado ou não pôde ser confirmado.'),
    })

    if (!profileNameIsIntact && profileAfterUpdateAttempt.data) {
      const restoration = await restoreUserBName(clientB, userBId, originalUserBName)
      if (restoration.restored) {
        console.log('[INFO] Nome original de B foi restaurado após a tentativa controlada.')
      }
    }

    const unauthorizedCoverUpdate = await clientA
      .from('profiles')
      .update({ cover_url: attemptedCoverForB })
      .eq('id', userBId)
      .select('id, cover_url')

    const coverAfterUnauthorizedUpdate = await clientB
      .from('profiles')
      .select('id, cover_url')
      .eq('id', userBId)
      .maybeSingle()

    const coverUpdateReturnedNoRows =
      Array.isArray(unauthorizedCoverUpdate.data) && unauthorizedCoverUpdate.data.length === 0
    const userBCoverIsIntact =
      !coverAfterUnauthorizedUpdate.error &&
      coverAfterUnauthorizedUpdate.data?.cover_url === originalUserBCoverUrl
    const unauthorizedCoverUpdateWasBlocked =
      userBCoverIsIntact &&
      (coverUpdateReturnedNoRows || isExpectedAuthorizationError(unauthorizedCoverUpdate.error))

    record(unauthorizedCoverUpdateWasBlocked, 'A NÃO conseguiu alterar a capa de B', {
      security: true,
      detail: unauthorizedCoverUpdateWasBlocked
        ? undefined
        : errorDetail(
            unauthorizedCoverUpdate.error,
            'UPDATE de cover_url afetou uma linha ou produziu um resultado inesperado.',
          ),
    })
    record(userBCoverIsIntact, 'Capa original de B continua intacta', {
      security: true,
      detail: errorDetail(
        coverAfterUnauthorizedUpdate.error,
        'A capa de B foi alterada ou não pôde ser confirmada.',
      ),
    })

    if (!userBCoverIsIntact && coverAfterUnauthorizedUpdate.data) {
      const restoration = await restoreProfileCover(clientB, userBId, originalUserBCoverUrl)
      if (restoration.restored) {
        console.log('[INFO] Capa original de B foi restaurada após a tentativa controlada.')
      }
    }

    if (userACoverSnapshotCaptured) {
      ownCoverMutationAttempted = true

      const legitimateCoverUpdate = await clientA
        .from('profiles')
        .update({ cover_url: temporaryCoverForA })
        .eq('id', userAId)
        .select('id, cover_url')

      const ownCoverAfterUpdate = await clientA
        .from('profiles')
        .select('id, cover_url')
        .eq('id', userAId)
        .maybeSingle()

      const ownCoverWasUpdated =
        !legitimateCoverUpdate.error &&
        legitimateCoverUpdate.data?.length === 1 &&
        legitimateCoverUpdate.data[0]?.cover_url === temporaryCoverForA &&
        !ownCoverAfterUpdate.error &&
        ownCoverAfterUpdate.data?.cover_url === temporaryCoverForA

      record(ownCoverWasUpdated, 'A conseguiu atualizar sua própria capa', {
        detail: errorDetail(
          legitimateCoverUpdate.error ?? ownCoverAfterUpdate.error,
          'O UPDATE legítimo de cover_url não foi confirmado.',
        ),
      })
    } else {
      record(false, 'A conseguiu atualizar sua própria capa', {
        detail: 'O valor original de cover_url de A não pôde ser registrado com segurança.',
      })
    }

    const unauthorizedInsert = await clientA
      .from('posts')
      .insert({ author_id: userBId, content: unauthorizedPostAsB })
      .select('id')

    const insertWasRejected =
      isExpectedAuthorizationError(unauthorizedInsert.error) &&
      (!unauthorizedInsert.data || unauthorizedInsert.data.length === 0)

    record(insertWasRejected, 'A NÃO conseguiu publicar em nome de B', {
      security: true,
      detail: insertWasRejected
        ? undefined
        : errorDetail(unauthorizedInsert.error, 'O INSERT não foi rejeitado explicitamente pela RLS.'),
    })

    requestedPostByAId = randomUUID()
    const legitimateInsert = await clientA.rpc('create_post_with_media', {
      p_post_id: requestedPostByAId,
      p_content: temporaryPostByA,
      p_media: [],
    })

    const ownPostAfterInsert = legitimateInsert.error
      ? { data: null, error: legitimateInsert.error }
      : await clientA
          .from('posts')
          .select('id, author_id')
          .eq('id', requestedPostByAId)
          .maybeSingle()

    const ownPostWasCreated =
      !legitimateInsert.error &&
      legitimateInsert.data === requestedPostByAId &&
      !ownPostAfterInsert.error &&
      ownPostAfterInsert.data?.author_id === userAId
    if (ownPostAfterInsert.data?.id) temporaryPostByAId = ownPostAfterInsert.data.id

    record(ownPostWasCreated, 'A conseguiu criar conteúdo em seu próprio nome', {
      detail: errorDetail(
        legitimateInsert.error ?? ownPostAfterInsert.error,
        'A criação atômica legítima de A falhou.',
      ),
    })

    if (temporaryPostByAId) {
      const mediaByAPath = `${userAId}/${temporaryPostByAId}/${randomUUID()}.webp`
      cleanupMediaPathsForA.add(mediaByAPath)

      const mediaByAInsert = await clientA
        .from('post_media')
        .insert({
          post_id: temporaryPostByAId,
          owner_id: userAId,
          media_type: 'image',
          storage_path: mediaByAPath,
          mime_type: 'image/webp',
          width: 8,
          height: 8,
          position: 0,
          alt_text: 'Fixture temporário próprio do smoke test de RLS',
        })
        .select('id, post_id, owner_id, storage_path')
        .single()

      const ownMediaWasCreated =
        !mediaByAInsert.error &&
        mediaByAInsert.data?.post_id === temporaryPostByAId &&
        mediaByAInsert.data?.owner_id === userAId &&
        mediaByAInsert.data?.storage_path === mediaByAPath

      record(ownMediaWasCreated, 'A conseguiu criar metadata de mídia no próprio post', {
        detail: errorDetail(mediaByAInsert.error, 'O INSERT legítimo de post_media de A falhou.'),
      })

      const legitimateDelete = await clientA
        .from('posts')
        .delete()
        .eq('id', temporaryPostByAId)
        .select('id')

      const ownPostWasDeleted =
        !legitimateDelete.error &&
        legitimateDelete.data?.length === 1 &&
        legitimateDelete.data[0]?.id === temporaryPostByAId

      record(ownPostWasDeleted, 'A conseguiu remover seu próprio conteúdo', {
        detail: errorDetail(legitimateDelete.error, 'O DELETE legítimo de A não removeu exatamente uma linha.'),
      })

      if (ownPostWasDeleted) {
        temporaryPostByAId = undefined
        requestedPostByAId = undefined
      }
    } else {
      record(false, 'A conseguiu criar metadata de mídia no próprio post', {
        detail: 'O post temporário de A não chegou a ser criado.',
      })
      record(false, 'A conseguiu remover seu próprio conteúdo', {
        detail: 'O post temporário de A não chegou a ser criado.',
      })
    }
  } catch (error) {
    record(false, 'O smoke test foi interrompido por um erro inesperado', {
      detail: errorDetail(error, 'Erro sem detalhes seguros.'),
    })
  } finally {
    console.log('[INFO] Iniciando limpeza dos dados temporários...')

    if (userAId && userACoverSnapshotCaptured && ownCoverMutationAttempted) {
      const restoration = await restoreProfileCover(clientA, userAId, originalUserACoverUrl)
      if (!restoration.ok) {
        record(false, 'CRÍTICO: não foi possível restaurar a capa original de A', {
          detail: errorDetail(restoration.error, 'A restauração não alterou exatamente uma linha.'),
        })
      } else {
        console.log('[INFO] Capa original de A foi confirmada ou restaurada durante a limpeza final.')
      }
    }

    if (userBId && userBCoverSnapshotCaptured) {
      const restoration = await restoreProfileCover(clientB, userBId, originalUserBCoverUrl)
      if (!restoration.ok) {
        record(false, 'CRÍTICO: não foi possível restaurar a capa original de B', {
          detail: errorDetail(restoration.error, 'A restauração não alterou exatamente uma linha.'),
        })
      } else if (restoration.restored) {
        console.log('[INFO] Capa original de B foi restaurada durante a limpeza final.')
      }
    }

    if (userBId && originalUserBName !== undefined) {
      const restoration = await restoreUserBName(clientB, userBId, originalUserBName)
      if (!restoration.ok) {
        record(false, 'CRÍTICO: não foi possível restaurar o nome original de B', {
          detail: errorDetail(restoration.error, 'A restauração não alterou exatamente uma linha.'),
        })
      } else if (restoration.restored) {
        console.log('[INFO] Nome original de B foi restaurado durante a limpeza final.')
      }
    }

    if (userAId && cleanupMediaPathsForA.size > 0) {
      const cleanupMediaA = await clientA
        .from('post_media')
        .delete()
        .in('storage_path', [...cleanupMediaPathsForA])
        .select('id')

      if (cleanupMediaA.error) {
        record(false, 'Falha ao limpar metadata temporária de mídia associada a A', {
          detail: errorDetail(cleanupMediaA.error, 'Limpeza de post_media de A falhou.'),
        })
      } else {
        console.log('[INFO] Metadata temporária de mídia associada a A foi removida ou já havia sido eliminada por cascade.')
      }
    }

    if (userBId && cleanupMediaPathsForB.size > 0) {
      const cleanupMediaB = await clientB
        .from('post_media')
        .delete()
        .in('storage_path', [...cleanupMediaPathsForB])
        .select('id')

      if (cleanupMediaB.error) {
        record(false, 'Falha ao limpar metadata temporária de mídia associada a B', {
          detail: errorDetail(cleanupMediaB.error, 'Limpeza de post_media de B falhou.'),
        })
      } else {
        temporaryMediaByBId = undefined
        console.log('[INFO] Metadata temporária de mídia associada a B foi removida ou já havia sido eliminada por cascade.')
      }
    }

    if (userBId) {
      // Remove tanto o fixture legítimo quanto um eventual INSERT indevido caso a RLS esteja quebrada.
      const cleanupB = await clientB
        .from('posts')
        .delete()
        .eq('author_id', userBId)
        .in('content', [temporaryPostByB, unauthorizedPostAsB])
        .select('id')

      if (cleanupB.error) {
        record(false, 'Falha ao limpar posts temporários associados a B', {
          detail: errorDetail(cleanupB.error, 'Limpeza de B falhou.'),
        })
      } else if (setupComplete) {
        console.log('[INFO] Posts temporários associados a B foram removidos.')
      }
    }

    if (userAId && requestedPostByAId) {
      const cleanupA = await clientA
        .from('posts')
        .delete()
        .eq('id', requestedPostByAId)
        .eq('author_id', userAId)
        .select('id')

      const cleanupAVerification = await clientA
        .from('posts')
        .select('id')
        .eq('id', requestedPostByAId)
        .maybeSingle()

      if (cleanupAVerification.error || cleanupAVerification.data) {
        record(false, 'CRÍTICO: falha ao limpar o post temporário de A', {
          detail: errorDetail(
            cleanupAVerification.error ?? cleanupA.error,
            'O post solicitado por A ainda existe após a limpeza.',
          ),
        })
      } else {
        console.log('[INFO] Post temporário solicitado por A foi removido ou já estava ausente.')
      }
    }

    if (userAId && cleanupPostIdsForA.size > 0) {
      const pollCleanupA = await clientA
        .from('posts')
        .delete()
        .eq('author_id', userAId)
        .in('id', [...cleanupPostIdsForA])
        .select('id')
      const pollCleanupVerificationA = await clientA
        .from('posts')
        .select('id')
        .in('id', [...cleanupPostIdsForA])

      if (pollCleanupVerificationA.error || (pollCleanupVerificationA.data?.length ?? 0) > 0) {
        record(false, 'CRÍTICO: falha ao limpar fixtures de enquete associados a A', {
          detail: errorDetail(
            pollCleanupVerificationA.error ?? pollCleanupA.error,
            'Um ou mais posts de enquete de A continuam existentes.',
          ),
        })
      } else {
        console.log('[INFO] Fixtures de enquete associados a A foram removidos ou já estavam ausentes.')
      }
    }

    if (userBId && cleanupPostIdsForB.size > 0) {
      const pollCleanupB = await clientB
        .from('posts')
        .delete()
        .eq('author_id', userBId)
        .in('id', [...cleanupPostIdsForB])
        .select('id')
      const pollCleanupVerificationB = await clientB
        .from('posts')
        .select('id')
        .in('id', [...cleanupPostIdsForB])

      if (pollCleanupVerificationB.error || (pollCleanupVerificationB.data?.length ?? 0) > 0) {
        record(false, 'CRÍTICO: falha ao limpar fixtures de enquete associados a B', {
          detail: errorDetail(
            pollCleanupVerificationB.error ?? pollCleanupB.error,
            'Um ou mais posts de enquete de B continuam existentes.',
          ),
        })
      } else {
        console.log('[INFO] Fixtures de enquete associados a B foram removidos ou já estavam ausentes.')
      }
    }

    await Promise.allSettled([clientA.auth.signOut(), clientB.auth.signOut()])

    const passed = results.filter((result) => result.passed).length
    const failed = results.length - passed
    const securityFailures = results.filter((result) => !result.passed && result.security).length

    console.log(`\nRLS TESTS: ${passed} passed / ${failed} failed`)

    if (securityFailures > 0) {
      console.error(`\n!!! SECURITY FAILURE: ${securityFailures} teste(s) de isolamento RLS falharam. Revise as policies antes de usar o projeto. !!!`)
    } else if (failed > 0) {
      console.error('\n[FAIL] A suíte não foi concluída com sucesso. Verifique configuração, fixtures e conectividade.')
    }

    if (failed > 0) process.exitCode = 1
  }
}

function createTestClient(url, publishableKey) {
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

async function restoreUserBName(clientB, userBId, originalName) {
  const currentProfile = await clientB
    .from('profiles')
    .select('name')
    .eq('id', userBId)
    .maybeSingle()

  if (currentProfile.error) {
    return { ok: false, restored: false, error: currentProfile.error }
  }

  if (currentProfile.data?.name !== originalName) {
    const restoration = await clientB
      .from('profiles')
      .update({ name: originalName })
      .eq('id', userBId)
      .select('id')

    if (restoration.error || restoration.data?.length !== 1) {
      return {
        ok: false,
        restored: false,
        error: restoration.error ?? new Error('A restauração não alterou exatamente uma linha.'),
      }
    }

    return { ok: true, restored: true }
  }

  return { ok: true, restored: false }
}

async function restoreProfileCover(client, userId, originalCoverUrl) {
  const currentProfile = await client
    .from('profiles')
    .select('cover_url')
    .eq('id', userId)
    .maybeSingle()

  if (currentProfile.error || !currentProfile.data) {
    return {
      ok: false,
      restored: false,
      error: currentProfile.error ?? new Error('O perfil não foi encontrado durante a restauração.'),
    }
  }

  if (currentProfile.data.cover_url !== originalCoverUrl) {
    const restoration = await client
      .from('profiles')
      .update({ cover_url: originalCoverUrl })
      .eq('id', userId)
      .select('id, cover_url')

    if (
      restoration.error ||
      restoration.data?.length !== 1 ||
      restoration.data[0]?.cover_url !== originalCoverUrl
    ) {
      return {
        ok: false,
        restored: false,
        error: restoration.error ?? new Error('A restauração não alterou exatamente uma linha.'),
      }
    }

    return { ok: true, restored: true }
  }

  return { ok: true, restored: false }
}
