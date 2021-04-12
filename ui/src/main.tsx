import { produce, enableAllPlugins } from 'immer'
enableAllPlugins()

import { I } from 'elt-fa'
import 'elt-fa/calendar-alt-regular'

import { $bind, $click, $observe, $on, o, Repeat, setup_mutation_observer } from 'elt'
import { Styling as S, rule, style } from 'elt-ui'

import { ConApp, GeomNode, Root, WindowEvent, Workspace, WorkspaceEvent } from './types'

// Things to implement
// input module
// input with fuzzy choices
// input with fuzzy choices and new possibility

//
// focus window <n> on visible workspace starting from leftmost to rightmost
// go to next workspace on same screen
// rename current workspace
// rename current group
// move window to workspace <n>
// invert workspaces ?

// workspaces not corresponding to a regular name will have

/**
  Stuff that I have to keep in mind, before even having a status
  - Workspace list *on current screen !!!*
     which means we want the outputs
     which also means that a given bar needs to know where it's at.
  - Active workspace
  ( - Current window ? )

  - Show the time
**/

rule`html, body`({
  width: '100%',
  height: '100%',
  fontSize: '60vh',
  fontFamily: `Ubuntu, "Segoe UI", sans-serif`,
})

const cls_bar = style('bar',
  S.flex.row.alignCenter,
  S.box.fullScreen.background('#3c3c3b').text.color('white'),
  { padding: '0 4px' },
)


const o_current_window = o(null as GeomNode | null)
const o_current_workspace = o(null as Workspace | null)

const o_workspaces = o(new Map<number, Workspace>())
const o_windows = o(new Map<number, ConApp>())

const o_groups = o(new Map<string, Set<number>>())
const o_workspace_groups = o_groups.tf(groups => {
  let res = new Map<number, Set<string>>()
  for (let [group, wrks] of groups) {
    for (let w of wrks) {
      if (!res.has(w)) {
        res.set(w, new Set([group]))
      } else {
        res.get(w)!.add(group)
      }
    }
  }
  return res
})

const o_focused_workspaces = o(new Map<string, number>())
const o_focused_workspaces_ids = o_focused_workspaces.tf(foc => new Set([...foc.values()]))

const o_groups_display = o.join(o_groups, o_workspaces, o_focused_workspaces_ids).tf(([groups, wrks, focused]) => [...groups].map(([name, numbers]) => {
  return { name: name, works: [...numbers].map(n => wrks.get(n)!).filter(w => !!w).map(w => {
    return {...w, visible: focused.has(w.id)} as Workspace & { visible: boolean }
  }) }
}))

// How do I know which is the current group ?
// should probably look at the "visible" workspaces
// and if their names aren't right then
const o_current_group = o('')

const o_visible_workspaces = o.join(o_groups_display, o_current_group).tf(([disp, group]) => {
  return disp.filter(d => d.name === group)[0].works.filter(w => w.visible)
})

/////////////////////////////////////////////////////////////////////////////////
////////////////////////// i3 functions /////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

class Commands {
  commands: {r: RegExp, cbk: (...args: string[]) => any}[] = []
  register(regexp: RegExp, fn: (...args: string[]) => any) {
    let oreg = new RegExp(regexp.source.replace(/ /g, '\\s+'), regexp.flags)
    this.commands.push({
      r: oreg,
      cbk: fn,
    })
  }
}
const com = new Commands()

/**
 * Focus the nth window from the left
 */
com.register(/^nop i3c nth (\d+)/, focus_nth_window)
function focus_nth_window(_nth: string) {
  let nth = parseInt(_nth)
  if (!Number.isSafeInteger(nth)) return

  if (nth < 1) nth = 1
  const w = o_visible_workspaces.get().slice()
  w.sort((a, b) => {
    if (a.rect.x < b.rect.x) return -1
    if (a.rect.x > b.rect.x) return 1
    return 0
  })
  // console.log(w)
  let nodes = [] as ConApp[]
  function process(g: GeomNode) {
    if (g.window && g.type === 'con')
      nodes.push(g as ConApp)
    for (let n of g.nodes) {
      process(n)
    }
  }
  for (let _w of w) process(_w)
  if (nth > nodes.length) nth = nodes.length
  i3(`[con_id=${nodes[nth-1].id}] focus`)
  // console.log(nodes.map(n => n.name))
}

com.register(/^nop i3c rename-group (.+)$/, (new_name) => group_rename(o_current_group.get().trim(), new_name.trim()))
com.register(/^nop i3c rename-group (.+?) to (.+)$/, (old_name, new_name) => group_rename(old_name.trim(), new_name.trim()))
com.register(/^nop i3c rename-group/, async () => {
  group_rename(o_current_group.get().trim(), await query())
})
function group_rename(old: string, _new: string) {
  if (!old || !_new) return
  o_groups.mutate(groups => produce(groups, groups => {
    let ol = groups.get(old)
    if (groups.has(_new) || !ol) return
    groups.delete(old)
    groups.set(_new, ol)
  }))
}

function workspace_send_to_group(w: number, group: string) {
  o_groups.mutate(groups => produce(groups, groups => {
    // we first remove the window from all the groups
    for (let g of groups.values())
      g.delete(w)
    // create the group if it didn't exist
    if (!groups.has(group)) groups.set(group, new Set())
    // add the workspace to the group
    groups.get(group)!.add(w)
  }))
  //
}

// Assign a workspace to another group
function workspace_assign_to_group(w: number, group: string) {
  o_groups.mutate(groups => produce(groups, groups => {
    // create the group if it didn't exist
    if (!groups.has(group)) groups.set(group, new Set())
    // add the workspace to the group
    groups.get(group)!.add(w)
  }))
}

// Send a window to the current workspace
function con_send_to_workspace(c: number, w: string) {
  window.__rpc('i3', `[id=${c}] move container to workspace "${w}"`)
}


/////////////////////////////////////////////////////////////////////////////////
////////////////////////// i3 functions /////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

function query(opts?: {}): Promise<string> {
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
        {o_workspaces.tf(w => JSON.stringify([...(w.values())].map(w => [w.name])))}
      </pre>
      <pre>
        {o_focused_workspaces.tf(f => JSON.stringify(f))}
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

function workspaces_focus_init() {
  window.__rpc('i3.get_workspaces').then(ws => {
    let focused = new Map<string, number>()
    // let groups = new Map<string, Set<number>>()
    // let current_group = o_current_group.get()
    // let def = new Set<number>()
    // groups.set(current_group, def)
    for (let w of ws) {
      // def.add(w.id)
      if (w.visible) {
        focused.set(w.output, w.id)
      }
    }
    // o_groups.set(groups)
    o_focused_workspaces.set(focused)
  })
}

const update_tree = o.debounce(function update_tree() {
  window.__rpc('i3.get_tree').then((r: Root) => {
    let wrk = new Map<number, Workspace>()
    let win = new Map<number, ConApp>() // as ConApp[]
    let current_workspace_groups = o_workspace_groups.get()
    let curgroup = o_current_group.get() // all new workspaces that we haven't seen get into the current group
    let groups = new Map<string, Set<number>>() // the new groups
    let current_group = new Set<number>()
    groups.set(curgroup, current_group)

    function process(n: GeomNode) {
      let id = n.id
      if (n.name === '__i3') return
      if (n.type === 'workspace') {
        wrk.set(id, n as Workspace)
        let cg = current_workspace_groups.get(id)
        if (cg) {
          for (let g of cg) {
            if (!groups.has(g)) groups.set(g, new Set())
            groups.get(g)!.add(id)
          }
        } else {
          // we didn't know this workspace
          current_group.add(id)
        }
        // need to check if workspace was already part of a group
      }
      if (n.type === 'con' && !!n.window) {
        win.set(n.id, n as any as ConApp)
        if (n.focused) {
          o_current_window.set(n)
        }
      }
      for (let c of n.nodes) {
        process(c)
      }
    }
    process(r)

    o.transaction(() => {
      o_workspaces.set(wrk)
      o_windows.set(win)
      o_groups.set(groups)
    })
  }, e => {
    console.error(e)
  })
}, 5)

function is_workspace(kind: any, event: any): event is WorkspaceEvent { return kind === 'workspace' }

function i3(cmd: string) {
  return window.__rpc('i3', cmd)
}

window.i3msg = function i3msg(kind: 'window' | 'binding' | 'workspace' | 'output', msg: any) {
  // console.log('i3-msg', msg)
  // console.log('msg', JSON.stringify(msg))
  if (!msg) return

  console.log(kind, msg.change, msg)
  if (kind === 'window') {
    const _m = msg as WindowEvent
    if (_m.change === 'focus') {
      o_current_window.set(_m.container)
    } else {
      update_tree()
    }
  } else if (kind === 'binding') {
    console.log('???')
    let command = msg.binding.command as string
    for (let c of com.commands) {
      let m = c.r.exec(command)
      if (m) {
        let matches = m.slice(1)
        c.cbk(...matches)
        break
      }
    }
    // focus_nth_window(3)
    // let m: RegExpMatchArray | null = null
    // if (m = /nop i3c\s*nth\s*(\d+)/.exec(msg.binding.command)) {
    //   focus_nth_window(m[1])
    // } else {
      // query().then(r => {
        // o_current_group.set(r)
      // })
    // }
  } else if (is_workspace(kind, msg)) {
    if (msg.change === 'focus') {
      o_current_workspace.set(msg.current)
      o_focused_workspaces.mutate(w => produce(w, w => {
        w.set(msg.current.output, msg.current.id)
      }))
    } else {
      update_tree()
    }
  }

  // console.log('exp', msg.current?.name ?? msg.container?.name)
}

let current_window: Window | null = null

const dt = Intl.DateTimeFormat('fr', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const o_time = o(new Date)
setInterval(() => {
  o_time.set(new Date)
}, 1000)

function init() {
  setup_mutation_observer(document.body)

  document.body.appendChild(<div class={cls_bar}>
    {$observe(o_current_group, (current, old) => {
      if (old === o.NoValue) return
      group_rename(old, current)
    })}
    {Repeat(o_groups_display, o_group => <div class={S.flex.row.alignCenter}>
      <div><span>{o_group.p('name')}</span></div>
      {Repeat(o_group.p('works'), o_work => <div
        class={S.box.padding(2).borderRound.border('#5c5b5c').text.centered}
        style={{
          width: '42px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'pre',
          background: o_work.tf(w => w.urgent ? 'red' : w.visible ? '#4c3d7c' : 'none')
        }}>
          {$click(async _ => {
            try {
              // console.log(`workspace "${o_work.get().name}"`)
              i3(`workspace ${o_work.get().name}`)
            } catch (e) {
              console.error(e)
            }
            _.stopPropagation()

          })}
          {o_work.p('name')}
      </div>)}
    </div>)}
    {$click(_ => {
      // o_current.set('POUET');
      query().then(r => console.log('result: ', r))
    })}
    <div class={S.flex.absoluteGrow(1)}>
      « {o_current_window.tf(w => {
        // console.log('current : ', w)
        // __rpc('???', w?.name)
        return w?.name ?? '-'
      })} »
    </div>
    <img src="file:///home/chris/swapp/apps/1811-ipsen-engagements/__dist__/client/android-icon-144x144.png" width="32" height="32"></img>
    <div>{I('calendar-alt-regular')} {o_time.tf(t => dt.format(t))}</div>
  </div>)
}


// window.__rpc('show')
// setInterval(() => {
//   window.__rpc('pouet')
// }, 1000)
update_tree()
workspaces_focus_init()
requestAnimationFrame(() => {
  init()
})