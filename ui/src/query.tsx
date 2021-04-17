import { o, setup_mutation_observer, $bind, $on, $click, Renderable, Repeat, If } from 'elt'


let current_window: Window | null = null

export function query(opts?: {
  title?: o.RO<Renderable>,
  text?: o.RO<Renderable>,
  list?: o.RO<Renderable[]>,
}): Promise<string> {
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
      {If(opts?.title, o_title => <h1>{o_title}</h1>)}
      {If(opts?.text, o_text => <div class="text">{o_text}</div>)}
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
      {If(opts?.list, o_list => <div class='entries'>
        {Repeat(o_list, o_item => <div class='entry'>{o_item}</div>)}
      </div>)}
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
