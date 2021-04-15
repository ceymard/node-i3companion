import './immerize'
// import { produce, enableAllPlugins } from 'immer'
// enableAllPlugins()

import { I } from 'elt-fa'
import 'elt-fa/calendar-alt-regular'

import { $click, $observe, o, Repeat, setup_mutation_observer } from 'elt'
import { Styling as S, rule, style } from 'elt-ui'

import { i3 } from './i3'

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
  { padding: '0 4px', overflow: 'hidden' },
)

/*
com.register(/^nop i3c group-rename (.+)$/, (new_name) => group_rename(o_current_group.get().trim(), new_name.trim()))
com.register(/^nop i3c group-rename (.+?) to (.+)$/, (old_name, new_name) => group_rename(old_name.trim(), new_name.trim()))
com.register(/^nop i3c group-rename/, async () => {
  const cur = o_current_group.get()
  const n = await query()
  // console.log(`renaming `, cur, n)
  group_rename(cur, n)
})

function group_rename(old: string, _new: string) {
  if (old == null || _new == null || old === _new) return
  const cur = o_current_group.get()
  o.transaction(() => {
    if (cur === old) {
      o_current_group.set(_new)
    }
    o_groups.mutate(groups => produce(groups, groups => {
      let ol = groups.get(old)
      if (groups.has(_new) || !ol) return
      groups.delete(old)
      groups.set(_new, ol)
    }))
  })
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
*/

/////////////////////////////////////////////////////////////////////////////////
////////////////////////// i3 functions /////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////



// function i3(cmd: string) {
//   return window.__rpc('i3', cmd)
// }
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

console.log(localStorage.pouet)
function init() {
  setup_mutation_observer(document.body)

  document.body.appendChild(<div class={cls_bar}>
    {i3}
    {$observe(i3.o_display_groups_show, s => console.log('show', s))}
    {Repeat(i3.o_display_groups_show, o_group => <div class={S.flex.row.alignCenter}>
      <div><span>{o_group.p('name')}</span></div>
      {Repeat(o_group.p('outputs'), o_output => <>
        {Repeat(o_output.p('workspaces'), o_work => <div
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
                i3.cmd(`workspace ${o_work.get().name}`)
              } catch (e) {
                console.error(e)
              }
              _.stopPropagation()

            })}
            {o_work.p('name')}
        </div>)}
      </>)}
    </div>)}
    {$click(_ => {
      // o_current.set('POUET');
      // query().then(r => console.log('result: ', r))
    })}
      {Repeat(i3.o_current_windows, (o_vis, idx) => <div
        title={o_vis.tf(v => v.name)}
        style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre'}}
        class={[S.flex.absoluteGrow(1).alignCenter, {[S.box.background('red')]: o_vis.p('focused')}]}
      >
        {$click(_ => {
          i3.cmd(`[con_id=${o_vis.get().id}] focus`)
        })}
        {idx+1}: {o_vis.tf(v => v.window_properties?.instance)} <span class={S.text.color('grey').size(S.SIZE_VERY_SMALL)}>({o_vis.tf(v => v.name)})</span>
      </div>)}
      {/* « {o_current_window.tf(w => {
        // console.log('current : ', w)
        // __rpc('???', w?.name)
        return w?.name ?? '-'
      })} » */}
    {/* <img src="file:///home/chris/swapp/apps/1811-ipsen-engagements/__dist__/client/android-icon-144x144.png" width="32" height="32"></img> */}
    <div>
      {I('calendar-alt-regular')}
      {' '}
      {o_time.tf(t => dt.format(t))}</div>
  </div>)
}


// window.__rpc('show')
// setInterval(() => {
//   window.__rpc('pouet')
// }, 1000)
i3.update_tree()
requestAnimationFrame(() => {
  init()
})