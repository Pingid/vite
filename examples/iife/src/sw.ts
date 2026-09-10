import { MARK } from './mark'

export default () => {
  console.log('[sw] setup', MARK)

  const onFetch = (event: Event) => void event
  addEventListener('fetch', onFetch)

  return () => {
    console.log('[sw] teardown', MARK)
    removeEventListener('fetch', onFetch)
  }
}
