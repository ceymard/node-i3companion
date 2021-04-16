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

  w.addEventListener('beforeunload', () => {
    if (!accepted) _reject(`canceled`)
    else _accept(o_result.get())
  })

  w.__init = function () {
    w.__rpc('show')
  }

  let link = document.querySelector('link[rel="stylesheet"]')! as HTMLLinkElement

  if (doc) {
    setup_mutation_observer(doc)
    doc.head.appendChild(<link rel="stylesheet" href={link.href}/>)
    doc.body.classList.add('dialog')
    doc.body.appendChild(<>
      <input class='main_input'>
        {$bind.string(o_result)}
        {$on('keypress', ev => {
          if (ev.code === 'Enter') {
            accepted = true
            w.close()
          }
        })}
        {node => { requestAnimationFrame(() => { node.focus() }) }}
      </input>
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
