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
    const fixturePost = await clientB
      .from('posts')
      .insert({ author_id: userBId, content: temporaryPostByB })
      .select('id, author_id, content')
      .single()

    if (fixturePost.error || !fixturePost.data) {
      record(false, 'Não foi possível criar o post temporário de B', {
        detail: errorDetail(fixturePost.error, 'A criação legítima do fixture falhou.'),
      })
      return
    }
    temporaryPostByBId = fixturePost.data.id
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

    const legitimateInsert = await clientA
      .from('posts')
      .insert({ author_id: userAId, content: temporaryPostByA })
      .select('id, author_id')
      .single()

    const ownPostWasCreated =
      !legitimateInsert.error && legitimateInsert.data?.author_id === userAId
    if (legitimateInsert.data?.id) temporaryPostByAId = legitimateInsert.data.id

    record(ownPostWasCreated, 'A conseguiu criar conteúdo em seu próprio nome', {
      detail: errorDetail(legitimateInsert.error, 'O INSERT legítimo de A falhou.'),
    })

    if (temporaryPostByAId) {
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

      if (ownPostWasDeleted) temporaryPostByAId = undefined
    } else {
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

    if (userAId && temporaryPostByAId) {
      const cleanupA = await clientA
        .from('posts')
        .delete()
        .eq('id', temporaryPostByAId)
        .eq('author_id', userAId)
        .select('id')

      if (cleanupA.error || cleanupA.data?.length !== 1) {
        record(false, 'Falha ao limpar o post temporário de A', {
          detail: errorDetail(cleanupA.error, 'Limpeza de A não removeu exatamente uma linha.'),
        })
      } else {
        console.log('[INFO] Post temporário de A foi removido durante a limpeza final.')
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
