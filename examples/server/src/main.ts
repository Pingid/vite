const marker = 'page-one'
console.log('[page]', marker)

fetch('/api/count')
  .then((r) => (r.headers.get('content-type')?.includes('json') ? r.json() : r.text()))
  .then((d) => console.log('[page] /api/count', d))

// self-accepting, so an edit here is a hot update rather than a reload
if (import.meta.hot) import.meta.hot.accept()
