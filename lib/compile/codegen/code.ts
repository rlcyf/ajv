export abstract class _CodeOrName {
  expr = false
  abstract readonly str: string
  abstract toString(): string
  abstract pushTo(arr: CodeItem[]): void
  abstract emptyStr(): boolean
  optimize(): _CodeOrName {
    return this
  }
}

export const IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i

export class Name extends _CodeOrName {
  readonly str: string

  constructor(s: string) {
    super()
    if (!IDENTIFIER.test(s)) throw new Error("CodeGen: name must be a valid identifier")
    this.str = s
  }

  toString(): string {
    return this.str
  }

  pushTo(arr: CodeItem[]): void {
    arr.push(this)
  }

  emptyStr(): boolean {
    return false
  }
}

export class _Code extends _CodeOrName {
  private readonly _items: CodeItem[]
  names?: UsedNames
  expr: boolean

  constructor(code: string | CodeItem[], names?: UsedNames, expr = false) {
    super()
    this._items = typeof code === "string" ? [code] : code
    // this._str = s
    this.names = names
    this.expr = expr
  }

  toString(): string {
    return this.str
  }

  pushTo(arr: CodeItem[]): void {
    arr.push(...this._items)
  }

  optimize(): _Code {
    let i = 1
    while (i < this._items.length - 1) {
      if (this._items[i] === "+") {
        const a = this._items[i - 1]
        const b = this._items[i + 1]
        let res: string | undefined
        if (typeof a == "string" && typeof b == "string") {
          if (a.endsWith('"') && b[0] === '"') res = a.slice(0, -1) + b.slice(1)
        } else if (typeof a == "string" && a.endsWith('"') && !(b instanceof Name)) {
          res = `${a.slice(0, -1)}${b}"`
        } else if (typeof b == "string" && b[0] === '"' && !(a instanceof Name)) {
          res = `"${a}${b.slice(1)}`
        }
        if (res) {
          this._items.splice(i - 1, 3, res)
          continue
        }
      }
      i++
    }
    return this
  }

  emptyStr(): boolean {
    return this.str === "" || this.str === '""'
  }

  get str(): string {
    return this._items.reduce((s: string, c: CodeItem) => `${s}${c}`, "")
  }
}

type CodeItem = Name | string | number | boolean | null

export type UsedNames = Record<string, number | undefined>

export type Code = _Code | Name

export type SafeExpr = Code | number | boolean | null

export const nil = new _Code("")

type TemplateArg = SafeExpr | string | undefined

export function _(strs: TemplateStringsArray, ...args: TemplateArg[]): _Code {
  const names: UsedNames = {}
  const code: CodeItem[] = [strs[0]]
  let i = 0
  while (i < args.length) {
    const arg = interpolate(args[i])
    if (arg instanceof _CodeOrName) {
      updateUsedNames(arg, names)
      if (arg.expr) arg.optimize()
      arg.pushTo(code)
    } else {
      code.push(arg)
    }
    code.push(strs[++i])
  }
  return new _Code(code, names)
}

export function str(strs: TemplateStringsArray, ...args: (TemplateArg | string[])[]): _Code {
  const names: UsedNames = {}
  const s = strs[0]
  const expr: CodeItem[] = s ? [safeStringify(s)] : []
  let i = 0
  while (i < args.length) {
    if (expr.length > 0) expr.push("+")
    const arg = interpolateStr(args[i])
    if (arg instanceof _CodeOrName) {
      updateUsedNames(arg, names)
      arg.pushTo(expr)
    } else {
      expr.push(arg)
    }
    const _s = strs[++i]
    if (_s) expr.push("+", safeStringify(_s))
  }
  return new _Code(expr, names, true)
}

// function concat(s: string, a: string | number | boolean | null | undefined): string {
//   return a === '""'
//     ? s
//     : s === '""'
//     ? `${a}`
//     : typeof a != "string"
//     ? `${s.slice(0, -1)}${a}"`
//     : s.endsWith('"') && a[0] === '"'
//     ? s.slice(0, -1) + a.slice(1)
//     : `${s} + ${a}`
// }

// export function str(strs: TemplateStringsArray, ...args: (TemplateArg | string[])[]): _Code {
//   const names: UsedNames = {}
//   return new _Code(
//     strs.map(safeStringify).reduce((res, s, i) => {
//       const arg = args[i - 1]
//       if (arg instanceof _CodeOrName) updateUsedNames(arg, names)
//       return concat(concat(res, interpolateStr(arg)), s)
//     }),
//     names
//   )
// }

export function updateUsedNames(
  src: Code | {names?: UsedNames},
  names: UsedNames,
  inc: 1 | -1 = 1
): void {
  if (src instanceof Name) {
    const n = src.str
    names[n] = (names[n] || 0) + inc
  } else if (src.names) {
    for (const n in src.names) {
      names[n] = (names[n] || 0) + inc * (src.names[n] || 0)
    }
  }
}

export function usedNames(e?: SafeExpr): UsedNames | undefined {
  if (e instanceof Name) return {[e.str]: 1}
  if (e instanceof _Code) return e.names
  return undefined
}

export function strConcat(c1: Code, c2: Code): Code {
  return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`
}

function interpolate(x: TemplateArg): SafeExpr | string {
  return x instanceof _CodeOrName || typeof x == "number" || typeof x == "boolean" || x === null
    ? x
    : safeStringify(x)
}

function interpolateStr(x: TemplateArg | string[]): SafeExpr | string {
  if (Array.isArray(x)) x = x.join(",")
  return interpolate(x)
  // x = interpolate(x)
  // return x instanceof _CodeOrName ? x.str : x
}

export function stringify(x: unknown): Code {
  return new _Code(safeStringify(x))
}

function safeStringify(x: unknown): string {
  return JSON.stringify(x)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

export function getProperty(key: Code | string | number): Code {
  return typeof key == "string" && IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`
}
