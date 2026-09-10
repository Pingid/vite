const v = import.meta.env.VITE_VIRTUAL

export const run = (k: any, cb: any) => {
  let loaded = false
  let dis: any
  import(v[k]!).then((mod) => {
    dis = cb(mod)
  })
  return {}
}
