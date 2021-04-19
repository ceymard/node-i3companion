import { o, setup_mutation_observer, $bind, $on, $click, Renderable, Repeat, If, $observe } from 'elt'


let current_window: Window | null = null

export function query(opts?: {
  title?: o.RO<Renderable>,
  text?: o.RO<Renderable>,
  list?: o.RO<string[]>,
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

  const o_selected = o(0)
  const o_filtered = o.join(o(opts?.list), o_result).tf(([lst, res]) => {
    if (!lst) return undefined
    let rlst = lst.filter(l => l.toLowerCase().indexOf(res.toLowerCase()) >= 0)
    let sel = o_selected.get()
    if (sel > rlst.length - 1) o_selected.set(Math.max(0, rlst.length - 1))
    return rlst
  })

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
            let lst = o_filtered.get()
            let sel = o_selected.get()
            if (lst && lst.length && lst[sel]) {
              o_result.set(lst[sel])
            }
            accepted = true
            w.close()
          }
        })}
        {node => { requestAnimationFrame(() => { node.focus() }) }}
      </input>
      {If(o_filtered, o_list => <div class='entries'>
        {Repeat(o_list, (o_item, idx) => <div class={['entry', {selected: o_selected.tf(s => s === idx)}]}>
          {$click(_ => {
            o_result.set(o.get(o_item))
            accepted = true
            w.close()
          })}
          {o_item}
        </div>)}
      </div>)}
    </>)
    doc.addEventListener('keydown', k => {
      // w.__rpc('keydown-popup', {})
      let sel = o_selected.get()
      let lst = o.get(o_filtered)
      if (k.code === 'Escape') {
        // _reject('canceled')
        w?.close()
      } else if (k.code === 'ArrowDown') {
        if (!lst) return
        o_selected.set(Math.min(sel+1, lst.length - 1))
      } else if (k.code === 'ArrowUp') {
        if (!lst) return
        o_selected.set(Math.max(0, sel-1))
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
