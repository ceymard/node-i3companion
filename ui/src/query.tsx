import { o, setup_mutation_observer, $bind, $on, $click } from 'elt'
import { Styling as S } from 'elt-ui'


let current_window: Window | null = null

export function query(opts?: {}): Promise<string> {
  const w = window.open("", undefined, "status=yes")

  const o_result = o('')
  // window.webkit.messageHandlers.external.postMessage({a: 'poewpeorwerjj'})
  if (!w) return Promise.reject('no window')
  if (current_window) {
    current_window.close()
  }
  current_window = w

  w.addEventListener('close', () => {
    current_window = null
  })

  var doc = w.document
  w.document.body.style.background = 'rgba(0, 0, 0, 1)'
  w.document.body.style.color = 'rgba(255, 255, 255, 1)'

  w.addEventListener('beforeunload', () => {
    if (!accepted) _reject(`canceled`)
    else _accept(o_result.get())
  })

  w.__init = function () {
    w.__rpc('show')
  }
  if (doc) {
    setup_mutation_observer(doc)
    doc.body.appendChild(<>
      <input class={S.box.fullWidth}>
        {$bind.string(o_result)}
        {$on('keypress', ev => {
          if (ev.code === 'Enter') {
            accepted = true
            w.close()
          }
        })}
        {node => { requestAnimationFrame(() => { node.focus() }) }}
      </input>
      <pre class={S.text.preWrap}>
        {$click(_ => {
          w?.close()
        })}
        {/* {o_workspaces.tf(w => JSON.stringify([...(w.values())].map(w => [w.name])))} */}
      </pre>
      <pre>
        {/* {o_focused_workspaces.tf(f => JSON.stringify(f))} */}
      </pre>
    </>)
    doc.addEventListener('keydown', k => {
      // w.__rpc('keydown-popup', {})
      if (k.code === 'Escape') {
        // _reject('canceled')
        w?.close()
      }
    })
  }

  let accepted = false
  let _accept: (res: string) => void
  let _reject: (err: any) => void
  return new Promise((accept, reject) => {
    _accept = accept
    _reject = reject
  })
}
