export const namespace = (id, files = {}) => {
    const encoded = `\0${id}`;
    const ns = { id, files, encoded };
    ns.includes = (name) => {
        if (name[0] === '\0')
            return name.startsWith(encoded + ':');
        return name.startsWith(id + ':');
    };
    ns.name = (id) => {
        if (id[0] === '\0')
            return id.slice(ns.encoded.length + 1);
        return id.slice(ns.id.length + 1);
    };
    ns.match = (id, fn) => {
        if (ns.includes(id))
            return fn(makeMatch(ns, ns.name(id)));
        return null;
    };
    ns.unknown = (name) => ({ kind: 'unknown', name, id: `${id}:${name}`, encoded: `\0${id}:${name}` });
    Object.entries(files).forEach(([fllabel, flId]) => {
        ns[fllabel] = { id: `${id}:${flId}`, encoded: `\0$${id}:${flId}` };
    });
    return ns;
};
const makeMatch = (ns, name) => {
    const id = `${ns.id}:${name}`;
    const base = { name, id, encoded: `\0${id}` };
    const matched = [...Object.entries(ns.files)].find(([, flId]) => flId === name);
    if (matched)
        return { ...base, kind: matched[0] };
    return { ...base, kind: 'unknown' };
};
//# sourceMappingURL=vite.js.map