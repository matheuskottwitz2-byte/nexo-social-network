import { Search, UsersRound, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { ProfileResult } from '../components/social/ProfileResult'
import { EmptyState, ErrorState, PageLoader } from '../components/ui/Status'
import { useDebounce } from '../hooks/useDebounce'
import { useSearchProfiles } from '../hooks/useNexoQueries'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const [value, setValue] = useState(query)
  const debounced = useDebounce(value, 350)
  const results = useSearchProfiles(query)

  useEffect(() => setValue(query), [query])
  useEffect(() => {
    const normalized = debounced.trim()
    if (normalized !== query) setParams(normalized ? { q: normalized } : {}, { replace: true })
  }, [debounced, query, setParams])

  function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = value.trim()
    setParams(normalized ? { q: normalized } : {})
  }

  return (
    <main className="page-surface">
      <PageHeader title="Explorar" subtitle="Encontre pessoas e novas perspectivas" />
      <form className="search-page-form" onSubmit={submit}>
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="people-search">Pesquisar por nome ou usuário</label>
        <input id="people-search" autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Busque por nome ou @usuário" />
        {value && <button type="button" onClick={() => setValue('')} aria-label="Limpar busca"><X /></button>}
      </form>
      <section className="search-results" aria-live="polite">
        {!query && <EmptyState icon={Search} title="Quem você quer encontrar?" description="Pesquise pelo nome ou nome de usuário de alguém." />}
        {query && results.isLoading && <PageLoader label="Buscando pessoas" />}
        {results.isError && <ErrorState onRetry={() => void results.refetch()} />}
        {results.data && results.data.length > 0 && (
          <div className="results-list">
            <div className="section-label"><h2>Resultados</h2><span>{results.data.length}</span></div>
            {results.data.map((profile) => <ProfileResult key={profile.id} profile={profile} />)}
          </div>
        )}
        {query && results.data?.length === 0 && <EmptyState icon={UsersRound} title="Nenhum perfil encontrado" description={`Não encontramos resultados para “${query}”. Tente outro termo.`} />}
      </section>
    </main>
  )
}
