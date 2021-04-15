import { o, $observe } from 'elt'
import { ConApp, GeomNode, Root, WindowEvent, Workspace, WorkspaceEvent } from './types'

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

/**
 *
 */
export class I3Cmd {

  // All o_i3_* observables are updated by i3 events and should not be modified manually.

  // The current group
  readonly o_current_group = o('-')

  // This observable is 100% managed by this application and is not dependent on i3
  readonly o_groups = o(new Map<string, Set<number>>())

  //////////////////////////////////////////////////////
  // Nodes are updated by update_tree.
  // There are all the nodes in here ; cons, outputs, workspaces, windows, etc.
  // The only change between what we store here and what we receive from i3 is that
  // we keep track of the parent (that i3 doesn't give us) and of the focus for the workspaces.
  readonly o_i3_nodes = o(new Map<number, GeomNode>())

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
    return Object.entries(disp).map(([group_name, out]) => {
      return {
        name: group_name,
        outputs: Object.entries(out).map(([name, workspaces]) => {
          return { name, workspaces }
        })
      }
    })
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

  /**
   *
   * @param old_group
   * @param new_group
   */
  @command(/^nop i3c group-rename (.+?) to (.+)$/, (old_name, new_name) => [old_name.trim(), new_name.trim()])
  @command(/^nop i3c group-rename (.+)$/, function (new_name) { return [this.o_current_group.get(), new_name] })
  @command(/^nop i3c group-rename/, async function () { return [this.o_current_group.get(), await query()] })
  renameGroup(old_group: string, new_group: string) {
    let cur = this.o_current_group.get()
    let groups = this.o_groups.get()

    // don't do anything
    if (!groups.has(old_group) || groups.has(new_group)) return

    o.transaction(() => {
      // update current_group
      if (cur === old_group) this.o_current_group.set(new_group)
      // update groups, removing a reference
      this.o_groups.produce(groups => {
        let ol = groups.get(old_group)!
        groups.delete(old_group)
        groups.set(new_group, ol)
      })
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
  switchGroup(to_group: string) {
    let cur = this.o_current_group.get()
    if (cur === to_group) return // do nothing if switching to current group
    this.o_current_group.set(cur)
  }

  ///////////////////////////////////////////////////////////////////////////////////////////
  // Updates

  update_tree = o.debounce(() => {
    window.__rpc('i3.get_tree').then((r: Root) => {
      console.log(r)
      let nodes = new Map<number, GeomNode>()

      let current_workspace_groups = this.o_workspaces_in_groups.get()
      let curgroup = this.o_current_group.get() // all new workspaces that we haven't seen get into the current group
      let groups = new Map<string, Set<number>>() // the new groups
      let current_group = new Set<number>()
      groups.set(curgroup, current_group)

      const process = (n: GeomNode, parent: number | null, is_visible = false, keep_first = false) => {
        let id = n.id
        // We always add the node.
        nodes.set(n.id, n)

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
          let cg = current_workspace_groups.get(id)
          if (cg) {
            // this workspace was already part of some groups, so it is added back to them.
            for (let g of cg) {
              if (!groups.has(g)) groups.set(g, new Set())
              groups.get(g)!.add(id)
            }
          } else {
            // we didn't know this workspace, so it goes into the default group.
            current_group.add(id)
          }
          // need to check if workspace was already part of a group
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
      }
      process(r, null)

      o.transaction(() => {
        this.o_i3_nodes.set(nodes)
        this.o_groups.set(groups)
      })
    }, e => {
      console.error(e)
    })
  }, 5)

  cmd(cmd: string) {
    return window.__rpc('i3', cmd)
  }

  handleI3Msg(kind: string, msg: any) {
    if (!msg) return
    console.log(kind, msg.change, msg)
    if (kind === 'window') {
      const _m = msg as WindowEvent
      if (_m.change === 'focus') {
        this.o_i3_focus_con_id.set(_m.container.id)
        this.o_i3_nodes.key(_m.container.id).assign(_m.container)
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
    let groups = this.o_display_groups.get()
    if (!groups[old_group]) return // this was a rename operation.

    // this is where we emit all the commands that focus the outputs one by one
    // and try to find a usable workspace or creates one.

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
