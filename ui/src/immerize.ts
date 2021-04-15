// import { o } from 'elt'
import { o } from 'elt'
import { produce as pro, enableAllPlugins, nothing } from 'immer'
enableAllPlugins()

declare module 'elt' {

  namespace o {
    interface Observable<A> {
      produce(fn: (a: A) => typeof nothing | void | A): void
    }
  }

}

o.Observable.prototype.produce = function produce<A>(this: o.Observable<A>, fn: (a: A) => typeof nothing | void | A) {
  var res: A | typeof nothing = pro(this.get(), function (val: A) {
    return fn(val) as any
  }) as any
  if (res === nothing) this.set(undefined!)
  else this.set(res as any)
}