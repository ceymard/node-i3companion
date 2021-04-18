import { o, $observe } from 'elt'
import { ConApp, GeomNode, Output, Root, WindowEvent, Workspace, WorkspaceEvent } from './types'

import { query } from './query'

function is_workspace_event(kind: any, event: any): event is WorkspaceEvent { return kind === 'workspace' }


function command<U extends any[]>(regexp: RegExp, intercept?: (this: I3Cmd, ...args: string[]) => (U | Promise<U>)) {
  return function decorator(target: I3Cmd, _key: string, desc: TypedPropertyDescriptor<(this: I3Cmd, ...args: U) => any>) {
    let orig = desc.value
    if (!orig) return

    if (!target._commands) target._commands = []

    if (intercept) {
      target._commands.push({
        regexp,
        fn: async function (this: I3Cmd, ...args: string[]) {
          let _args = await intercept.apply(this, args)
          return orig?.apply(this, _args)
        }
      })
    } else {
      target._commands.push({
        regexp: new RegExp(regexp.source.replace(/ /g, '\\s+'), regexp.flags),
        fn: orig as any
      })
    }

  }
}

let wrk_id = 100
/**
 *
 */
export class I3Cmd {

  // All o_i3_* observables are updated by i3 events and should not be modified manually.

  // The current group
  readonly o_current_group = o('')

  // This observable is 100% managed by this application and is not dependent on i3
  // readonly o_groups = o(new Map<string, Set<number>>())

  //////////////////////////////////////////////////////
  // Nodes are updated by update_tree.
  // There are all the nodes in here ; cons, outputs, workspaces, windows, etc.
  // The only change between what we store here and what we receive from i3 is that
  // we keep track of the parent (that i3 doesn't give us) and of the focus for the workspaces.
  readonly o_i3_nodes = o(new Map<number, GeomNode>())

  readonly o_i3_workspaces = this.o_i3_nodes.tf(nodes => {
    let res: Workspace[] = []
    for (let n of nodes.values())
      if (n.type === 'workspace')
        res.push(n as Workspace)
    return res
  })

  // groups
  readonly o_groups = this.o_i3_nodes.tf(nodes => {
    let m = new Map<string, Set<number>>()
    for (let n of nodes.values()) {
      if (n.type !== 'workspace' || !n.groups) continue
      for (let g of n.groups) {
        if (!m.has(g)) m.set(g, new Set())
        m.get(g)!.add(n.id)
      }
    }
    return m
  })

  /////////////////////////////////////////////////////////////////
  // Focus tracking is done manually
  // The screen with the focus output_id
  readonly o_i3_focus_screen_id = o(-1)
  // a Map of output_name -> workspace.id
  readonly o_i3_focus_workspaces_id = o(new Map<string, number>())
  // the con that has the focus. There can be only one.
  readonly o_i3_focus_con_id = o(-1)

  /////////////////////////////////////////////////////////////////////////////////
  // Helper observables
  //   A bunch of transforms that help in displaying a some treatments.

  readonly o_outputs = this.o_i3_nodes.tf(nodes => {
    let res = new Map<string, Output>()
    for (let n of nodes.values()) {
      if (n.type !== 'output') continue
      res.set(n.name, n as Output)
    }
    return res
  })

  /** The display groups give the following: group_name -> output_name -> Workspace[] */
  readonly o_display_groups = o.join(this.o_groups, this.o_i3_nodes).tf(([groups, nodes]) => {
    let res: {[group: string]: { [output: string]: Workspace[] }} = {}
    for (let [group_name, workspaces] of groups) {
      let output_map: {[output: string]: Workspace[]} = {}
      res[group_name] = output_map

      for (let wid of workspaces) {
        let wn = nodes.get(wid) as Workspace
        if (!wn) continue
        let wset = output_map[wn.output] = output_map[wn.output] ?? []
        wset.push(wn)
      }
    }
    return res
  })

  readonly o_display_groups_show = this.o_display_groups.tf(disp => {
    let res = Object.entries(disp).map(([group_name, out]) => {
      return {
        name: group_name,
        outputs: Object.entries(out).map(([name, workspaces]) => {
          return { name, workspaces }
        })
      }
    })
    return res
  })

  /** A map of workpspace_id => Set<group_names> */
  readonly o_workspaces_in_groups = this.o_groups.tf((groups) => {
    let res = new Map<number, Set<string>>()
    for (let [name, workspace_ids] of groups) {
      for (let w of workspace_ids) {
        let groups = res.get(w) ?? (() => { let s = new Set<string>(); res.set(w, s); return s })()
        groups.add(name)
      }
    }
    return res
  })

  readonly o_current_windows = o.join(this.o_i3_nodes).tf(([nodes]) => {
    let res: ConApp[] = []
    for (let node of nodes.values()) {
      if (node.visible && node.window && node.type === 'con') {
        res.push(node as ConApp)
      }
    }
    return res
  })

  ////////////////////////////////////////////////////////////////////////////////
  // nop commands

  /**
   *
   * @param nth
   */
  @command(/^nop i3c nth (\d+)/)
  focusNthWindow(_nth: string) {
    let nth = parseInt(_nth)
    if (!Number.isSafeInteger(nth)) return
    let windows = this.o_current_windows.get()
    if (!windows.length) return
    nth = Math.min(windows.length, Math.max(nth, 1)) - 1
    this.cmd(`[con_id=${windows[nth].id}] focus`)
  }

  @command(/^nop i3c nth-workspace (\d+)/)
  focusNthWorkspace(_nth: string) {
    let nth = parseInt(_nth)
    if (!Number.isSafeInteger(nth)) return

    let current = this.o_current_group.get()
    let workspaces = [...(this.o_groups.get().get(current) ?? [])]
    if (!workspaces.length) return

    nth = Math.min(workspaces.length, Math.max(nth, 1)) - 1
    const node = this.o_i3_nodes.get().get(workspaces[nth])
    if (!node) {
      this.cmd(`workspace "${wrk_id++}"`)
    } else {
      this.cmd(`workspace "${node.name}"`)
    }
  }

  /**
   *
   * @param old_group
   * @param new_group
   */
  @command(/^nop i3c group-rename (.+?) to (.+)$/, (old_name, new_name) => [old_name.trim(), new_name.trim()])
  @command(/^nop i3c group-rename (.+)$/, function (new_name) { return [this.o_current_group.get(), new_name] })
  @command(/^nop i3c group-rename/, async function () { return [this.o_current_group.get(), await query({
    text: `Enter the new group name :`
  })] })
  renameGroup(old_group: string, new_group: string) {
    let cur = this.o_current_group.get()
    let groups = this.o_groups.get()
    let wrk = this.o_i3_workspaces.get()

    // don't do anything
    if (!groups.has(old_group) || groups.has(new_group)) return

    let commands: string[] = []
    o.transaction(() => {
      for (let n of wrk.values()) {
        if (n.groups.has(old_group)) {
          let s = new Set([...n.groups])
          s.delete(old_group)
          s.add(new_group)
          if (n.is_current_group) n.groups.add(cur)
          let cmd = `rename workspace "${n.name}" to "${!n.is_current_group ? ':::' : ''}${n.label}::${[...s].join(',')}"`
          commands.push(cmd)
        }
      }
      this.cmd(commands.join('; '))
      if (cur === old_group) this.o_current_group.set(new_group)
    })
  }

  /**
   * Change the current group to the new one.
   *
   *  - changes this.o_current_group
   *  - for each screen
   *     find the last used workspace on that screen that pertains to this group
   *     if there was none (for instance when switching to a new group), focus the screen
   *     and create a new group.
   *
   * @param to_group
   */
  @command(/^nop i3c group-switch (.+?)$/)
  @command(/^nop i3c group-switch\s*$/, async function () { return [await query({
    text: `Select a group or enter the name of a new one :`,
    list: [...this.o_groups.get().keys()]
  })] })
  switchGroup(to_group: string) {
    let cur = this.o_current_group.get()
    if (cur === to_group) return // do nothing if switching to current group
    let wrk = this.o_i3_workspaces.get()
    for (let w of wrk) {

    }

    this.o_current_group.set(to_group)
  }

  @command(/^nop i3c reload-style/)
  reloadStyle() {
    let link = document.querySelector('link[rel="stylesheet"]')
    if (!link) return
    let l = link as HTMLLinkElement
    l.parentNode!.removeChild(link)
    l.href = l.href.replace(/(\?.+)?$/, `?${new Date().valueOf()}`)
    requestAnimationFrame(() => {
      document.head.appendChild(l)
    })
  }

  ///////////////////////////////////////////////////////////////////////////////////////////
  // Updates

  update_tree = o.debounce(() => {
    window.__rpc('i3.get_tree').then((r: Root) => {
      let nodes = new Map<number, GeomNode>()

      // let current_workspace_groups = this.o_workspaces_in_groups.get()
      let curgroup = this.o_current_group.get() ?? '' // all new workspaces that we haven't seen get into the current group

      const process = (n: GeomNode, parent: number | null, is_visible = false, keep_first = false) => {
        let id = n.id
        // We always add the node.
        nodes.set(n.id, n)
        n.label = n.type === 'workspace' ? n.name.replace(/(^:::)|(::.*$)/g, '') : n.name

        // console.log(n.type, n.name, is_visible, keep_first)
        // Our added attributes
        if (parent) {
          n.parent = parent
          nodes.set(id, n)
        }

        n.visible = is_visible && (n.type === 'workspace' || n.type === 'con') || n.type === 'output'
        ///

        // Ignore __i3 ?
        if (n.name === '__i3') return
        if (n.type === 'workspace') {
          let match = /(?::::)?(?:(?!::).)+(?:::([^]*))?$/.exec(n.name)
          n.groups = new Set()
          if (match?.[1]) m: {
            let _groups = match[1]
            // this workspace was already part of some groups, so it is added back to them.
            for (let g of _groups.split(',')) {
              if (!curgroup) {
                curgroup = g
                this.o_current_group.set(g)
              }
              if (g === curgroup) n.is_current_group = true
              n.groups.add(g)
            }
          } else {
            // we didn't know this workspace, so it goes into the default group.
            n.is_current_group = true
            if (curgroup) n.groups.add(curgroup)
          }
        }
        if (n.type === 'con' && !!n.window) {
          if (n.focused) {
            this.o_i3_focus_con_id.set(n.id)
          }
        }

        // handle children
        let first_child_focus = n.focus[0]
        for (let c of n.nodes) {
          let first = keep_first ? is_visible : is_visible && c.id === first_child_focus
          if (n.type === 'output') first = true
          if (n.type === 'dockarea') {
            first = false
            keep_first = false
          }
          process(c, n.id, first, keep_first || n.type === 'workspace')
        }

        if (n.name === 'content' && n.type === 'con') {
          var i = 0
          for (let f of n.focus) {
            let nw = nodes.get(f) as Workspace | undefined
            if (!nw) continue
            nw.order = i++
          }
        }
      }
      process(r, null)

      this.o_i3_nodes.set(nodes)
    }, e => {
      console.error(e)
    })
  }, 5)

  cmd(cmd: string) {
    return window.__rpc('i3', cmd)
      .then(r => { console.log(r); return r })
  }

  handleI3Msg(kind: string, msg: any) {
    if (!msg) return
    if (kind === 'window') {
      const _m = msg as WindowEvent
      if (_m.change === 'focus') {
        o.transaction(() => {
          this.o_i3_focus_con_id.set(_m.container.id)
          this.o_i3_nodes.key(_m.container.id).assign(_m.container)
        })
      } else {
        this.update_tree()
      }
    } else if (kind === 'binding') {
      let command = msg.binding.command as string
      this.runCommand(command)
    } else if (is_workspace_event(kind, msg)) {
      this.update_tree()
    } else if (kind === 'reset') {
      this.update_tree()
    }
  }

  [E.sym_render]() {
    return <div style={{display: 'none'}}>
      {$observe(this.o_current_group, (cur, old) => {
        // console.log(cur, old)
        if (old === o.NoValue) return
        this.onCurrentGroupChange(old, cur)
      })}
      {$observe(this.o_i3_focus_con_id, (id, old_id) => {
        if (old_id === o.NoValue || old_id === -1) return
        // update the focused node
        this.o_i3_nodes.produce(nodes => {
          function tag(n: number, val: boolean) {
            let node = nodes.get(n)
            if (!node) return
            node.focused = val
            tag(node.parent, val)
          }
          tag(old_id, false)
          tag(id, true)
        })
      })}
    </div>
  }

  onCurrentGroupChange(old_group: string, new_group: string) {
    let works = this.o_i3_workspaces.get()

    let currently_visible = new Map<string, Workspace>()
    let replacements = new Map<string, Workspace>()
    let commands: string[] = []

    // rename all the workspaces
    for (let w of works) {
      if (w.visible) currently_visible.set(w.output, w)

      if (w.groups.has(new_group)) {

        {
          let repl = replacements.get(w.output)
          if (!repl || repl.order > w.order) {
            replacements.set(w.output, w)
          }
        }

        if (!w.is_current_group) {
          // rename the workspace to remove its leading ':::'
          let other = `${w.label}::${[...w.groups].join(',')}`
          this.cmd(`rename workspace "${w.name}" to "${other}"`)
        }
      } else {
        // this workspace was already not visible, no need to change its name, nor to probe if it should be displayed.
        if (!w.is_current_group) continue

        let other = `:::${w.label}::${[...w.groups].join(',')}`
        this.cmd(`rename workspace "${w.name}" to "${other}"`)
      }
    }

    for (let [output, visible] of currently_visible) {
      this.cmd(`output "${output}"`)
      let repl = replacements.get(output)
      if (repl) {
        this.cmd(`workspace "${repl.label}::${[...repl.groups].join(',')}"`)
      } else {
        this.cmd(`workspace "${visible.label}"`)
      }
    }
    // console.log(commands)

    // this.cmd(commands.join(' ; ')).then(c => {
    //   console.log('res:', c)
    // })
  }


  _commands!: { regexp: RegExp, fn: (...args: string[]) => any }[]
  runCommand(i3cmd: string) {
    for (let c of this._commands) {
      let m = c.regexp.exec(i3cmd)
      if (m) {
        let matches = m.slice(1)
        c.fn.apply(this, matches)
        return
      }
    }
  }
}

export const i3 = new I3Cmd()
window.i3msg = function i3msg(kind: 'window' | 'binding' | 'workspace' | 'output' | 'reset', msg: any) {
  i3.handleI3Msg(kind, msg)
}
