import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createPaste, deletePaste, getPaste, listPastes, updatePaste } from './lib/api';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { HtmlView, MarkdownView, plaintextFromHtml } from './lib/markdown';
import { Editor } from './components/Editor';
import type { Paste, PasteDraft, PasteSummary } from './types';

type Route =
  | { name: 'home' }
  | { name: 'explore' }
  | { name: 'mine' }
  | { name: 'paste'; slug: string }
  | { name: 'edit'; slug: string }
  | { name: 'not-found' };

function routeFromLocation(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'explore' && parts.length === 1) return { name: 'explore' };
  if (parts[0] === 'mine' && parts.length === 1) return { name: 'mine' };
  if (parts[0] === 'p' && parts[1] && parts.length === 2) return { name: 'paste', slug: parts[1] };
  if (parts[0] === 'p' && parts[1] && parts[2] === 'edit' && parts.length === 3) return { name: 'edit', slug: parts[1] };
  return { name: 'not-found' };
}

function useRoute() {
  const [route, setRoute] = useState<Route>(() => routeFromLocation());
  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(routeFromLocation());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return { route, navigate };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summaryExcerpt(paste: PasteSummary) {
  const raw = paste.content_type === 'html' ? plaintextFromHtml(paste.excerpt) : stripMarkdown(paste.excerpt);
  return raw || 'No preview text.';
}

function pasteTitle(title: string) {
  return title.trim() || 'Untitled paste';
}

function Badge({ children }: { children: string }) {
  return <span className="badge">{children}</span>;
}

function NavLink({ href, current, navigate, children }: { href: string; current: boolean; navigate: (path: string) => void; children: string }) {
  return (
    <a
      className={current ? 'active' : ''}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function Header({ route, session, navigate }: { route: Route; session: Session | null; navigate: (path: string) => void }) {
  const [authMessage, setAuthMessage] = useState('');
  const current = route.name;

  async function signIn(provider: 'google' | 'github') {
    if (!supabase) return;
    setAuthMessage('');
    sessionStorage.setItem('md-paste:returnTo', `${window.location.pathname}${window.location.search}`);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthMessage(error.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthMessage('Signed out.');
  }

  return (
    <header className="site-header">
      <div className="brand-row">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}>
          <span className="brand-mark">md</span>
          <span>Paste</span>
        </a>
        <nav>
          <NavLink href="/" current={current === 'home'} navigate={navigate}>New</NavLink>
          <NavLink href="/explore" current={current === 'explore'} navigate={navigate}>Explore</NavLink>
          <NavLink href="/mine" current={current === 'mine'} navigate={navigate}>Mine</NavLink>
        </nav>
      </div>
      <div className="auth-row">
        {session ? (
          <>
            <span className="user-chip">{session.user.email || 'Signed in'}</span>
            <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <>
            <button className="ghost-button" type="button" onClick={() => void signIn('github')}>GitHub</button>
            <button className="ghost-button" type="button" onClick={() => void signIn('google')}>Google</button>
          </>
        )}
        {authMessage ? <span className="auth-message">{authMessage}</span> : null}
      </div>
    </header>
  );
}

function ConfigMissing() {
  return (
    <main className="page narrow-page">
      <section className="empty-state">
        <h1>Supabase is not configured</h1>
        <p>Create a <code>.env.local</code> file with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart Vite.</p>
      </section>
    </main>
  );
}

function HomePage({ session, navigate }: { session: Session | null; navigate: (path: string) => void }) {
  async function handleCreate(draft: PasteDraft) {
    const created = await createPaste(draft);
    navigate(`/p/${created.slug}`);
  }

  return (
    <main className="page">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Supabase-backed Markdown and HTML pastes</p>
          <h1>Paste something useful. Keep it safe by default.</h1>
        </div>
        <div className="quota-card">
          <strong>Daily limits</strong>
          <span>Anonymous: 100 pastes per IP</span>
          <span>Signed in: 1000 pastes per user</span>
        </div>
      </section>
      <Editor submitLabel="Create paste" isAuthenticated={Boolean(session)} onSubmit={handleCreate} />
    </main>
  );
}

function PastePage({ slug, session, navigate }: { slug: string; session: Session | null; navigate: (path: string) => void }) {
  const [paste, setPaste] = useState<Paste | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getPaste(slug)
      .then((data) => { if (alive) setPaste(data); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Paste not found.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, session?.access_token]);

  async function handleDelete() {
    if (!paste || !window.confirm('Delete this paste? This cannot be undone.')) return;
    await deletePaste(paste.slug);
    navigate('/mine');
  }

  async function copyLink() {
    const url = `${window.location.origin}/p/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopyMessage('Copied link.');
    window.setTimeout(() => setCopyMessage(''), 1600);
  }

  if (loading) return <main className="page narrow-page"><p className="loading-line">Loading paste...</p></main>;
  if (error || !paste) return <main className="page narrow-page"><section className="empty-state"><h1>Paste not found</h1><p>{error || 'This paste does not exist or is private.'}</p></section></main>;

  return (
    <main className="page narrow-page">
      <article className="paste-shell">
        <header className="paste-header">
          <div>
            <h1>{pasteTitle(paste.title)}</h1>
            <div className="meta-row">
              <Badge>{paste.content_type}</Badge>
              <Badge>{paste.visibility}</Badge>
              <span>Created {formatDate(paste.created_at)}</span>
              {paste.updated_at !== paste.created_at ? <span>Updated {formatDate(paste.updated_at)}</span> : null}
            </div>
          </div>
          <div className="paste-actions">
            <button className="ghost-button" type="button" onClick={() => void copyLink()}>Copy link</button>
            {paste.is_owner ? <button className="ghost-button" type="button" onClick={() => navigate(`/p/${paste.slug}/edit`)}>Edit</button> : null}
            {paste.is_owner ? <button className="danger-button" type="button" onClick={() => void handleDelete()}>Delete</button> : null}
          </div>
        </header>
        {copyMessage ? <p className="status-message inline-status">{copyMessage}</p> : null}
        <div className="paste-body">
          {paste.content_type === 'markdown' ? <MarkdownView content={paste.content} /> : <HtmlView content={paste.content} />}
        </div>
      </article>
    </main>
  );
}

function EditPage({ slug, session, navigate }: { slug: string; session: Session | null; navigate: (path: string) => void }) {
  const [paste, setPaste] = useState<Paste | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getPaste(slug)
      .then((data) => { if (alive) setPaste(data); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Could not load paste.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, session?.access_token]);

  async function handleUpdate(draft: PasteDraft) {
    await updatePaste(slug, draft);
    navigate(`/p/${slug}`);
  }

  if (!session) return <main className="page narrow-page"><section className="empty-state"><h1>Sign in required</h1><p>You need to sign in before editing a paste.</p></section></main>;
  if (loading) return <main className="page narrow-page"><p className="loading-line">Loading editor...</p></main>;
  if (error || !paste) return <main className="page narrow-page"><section className="empty-state"><h1>Could not load paste</h1><p>{error}</p></section></main>;
  if (!paste.is_owner) return <main className="page narrow-page"><section className="empty-state"><h1>Not your paste</h1><p>Only the owner can edit this paste.</p></section></main>;

  return (
    <main className="page">
      <section className="page-heading">
        <h1>Edit paste</h1>
        <button className="ghost-button" type="button" onClick={() => navigate(`/p/${slug}`)}>Cancel</button>
      </section>
      <Editor initial={paste} submitLabel="Save changes" isAuthenticated={Boolean(session)} onSubmit={handleUpdate} />
    </main>
  );
}

function ListPage({ mine, session, navigate }: { mine: boolean; session: Session | null; navigate: (path: string) => void }) {
  const [items, setItems] = useState<PasteSummary[]>([]);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mine && !session) return;
    let alive = true;
    setLoading(true);
    setError('');
    listPastes({ mine, q: submittedQuery, page })
      .then((data) => {
        if (!alive) return;
        setItems(data.pastes);
        setTotal(data.total);
      })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Could not load pastes.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mine, page, session, submittedQuery]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  if (mine && !session) {
    return <main className="page narrow-page"><section className="empty-state"><h1>Sign in to see your pastes</h1><p>Use Google or GitHub to save private pastes and manage your history.</p></section></main>;
  }

  return (
    <main className="page narrow-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">{mine ? 'Your library' : 'Public stream'}</p>
          <h1>{mine ? 'Your pastes' : 'Explore pastes'}</h1>
        </div>
        <form className="search-form" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedQuery(query.trim()); }}>
          <input value={query} placeholder="Search title or content" onChange={(event) => setQuery(event.target.value)} />
          <button className="ghost-button" type="submit">Search</button>
        </form>
      </section>

      {loading ? <p className="loading-line">Loading pastes...</p> : null}
      {error ? <p className="status-message error">{error}</p> : null}
      {!loading && !items.length ? <section className="empty-state"><h2>No pastes yet</h2><p>{mine ? 'Create your first paste from the New page.' : 'No public pastes matched your search.'}</p></section> : null}

      <div className="paste-list">
        {items.map((paste) => (
          <article className="paste-card" key={paste.slug}>
            <div>
              <h2><a href={`/p/${paste.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/p/${paste.slug}`); }}>{pasteTitle(paste.title)}</a></h2>
              <p>{summaryExcerpt(paste)}</p>
              <div className="meta-row">
                <Badge>{paste.content_type}</Badge>
                <Badge>{paste.visibility}</Badge>
                <span>{formatDate(paste.created_at)}</span>
              </div>
            </div>
            {paste.is_owner ? <button className="ghost-button" type="button" onClick={() => navigate(`/p/${paste.slug}/edit`)}>Edit</button> : null}
          </article>
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="pager">
          <button className="ghost-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button className="ghost-button" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      ) : null}
    </main>
  );
}

function App() {
  const { route, navigate } = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const returnTo = sessionStorage.getItem('md-paste:returnTo');
    if (!returnTo || !returnTo.startsWith('/')) return;
    sessionStorage.removeItem('md-paste:returnTo');
    if (returnTo !== window.location.pathname) navigate(returnTo);
  }, [navigate, session]);

  const content = useMemo(() => {
    if (!hasSupabaseConfig) return <ConfigMissing />;
    if (!authReady) return <main className="page narrow-page"><p className="loading-line">Preparing auth...</p></main>;
    if (route.name === 'home') return <HomePage session={session} navigate={navigate} />;
    if (route.name === 'explore') return <ListPage mine={false} session={session} navigate={navigate} />;
    if (route.name === 'mine') return <ListPage mine session={session} navigate={navigate} />;
    if (route.name === 'paste') return <PastePage slug={route.slug} session={session} navigate={navigate} />;
    if (route.name === 'edit') return <EditPage slug={route.slug} session={session} navigate={navigate} />;
    return <main className="page narrow-page"><section className="empty-state"><h1>Not found</h1><p>This route does not exist.</p></section></main>;
  }, [authReady, navigate, route, session]);

  return (
    <>
      <Header route={route} session={session} navigate={navigate} />
      {content}
    </>
  );
}

export default App;
