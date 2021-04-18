declare global {
  interface Window {
    i3msg(kind: string, msg: any): void
    __init(): any
    __rpc(dest: 'run', msg: string[]): Promise<{stdout: string, stderr: string}>
    __rpc(dest: string, msg?: any): Promise<any>
    webkit: {
      messageHandlers: {
        external: {
          postMessage: (str: string) => Promise<null>
        }
      }
    }
  }
}

export interface Node {
  id: number
  name: string
  label: string // for workspaces

  groups?: Set<string>
  is_current_group?: boolean

  output: string
  type: string
}

export interface WindowProperties {
  class: string
  instance: string
  title: string
  transient_for: null | string[]
}

export interface GeomNode extends Node {
  parent: number // this is filled by us.
  visible: boolean

  border: 'pixel'
  current_border_width: number

  focus: number[]
  layout: 'splith' | 'splitv' | 'tabbed'
  fullscreen_mode: number
  floating_nodes: number[]
  marks: string[] | null
  focused: boolean
  percent: number // ???
  urgent: false
  output: string
  nodes: GeomNode[]

  deco_rect: Geometry
  rect: Geometry
  window: number
}

export interface DockArea extends GeomNode {
  type: 'dockarea'
}

export interface WorkspaceHolder extends GeomNode {
  type: 'con'
  nodes: Workspace[]
}

export interface Output extends GeomNode {
  nodes: WorkspaceHolder[]
  type: 'output'
  window: 0
}

export interface Workspace extends GeomNode {
  type: 'workspace'
  order: number
  visible: boolean
  groups: Set<string>
}

export interface Con extends GeomNode {
  type: 'con'
  window: any
}

export interface ConApp extends Con {
  window: number // 0 if not an application
  window_properties: WindowProperties
  window_type: 'normal' | ''
  window_rect: Geometry
}

export interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

export interface Root extends GeomNode {
  type: 'root'
  nodes: Output[]
}

export interface SimpleWorkspace extends Node {
  focused: boolean
  output: string
  num: number
  urgent: false
  visible: true
  rect: Geometry
}

export interface WorkspaceEvent {
  change: 'init' | 'empty' | 'focus' | 'urgent'
  current: Workspace
  old?: Workspace
}

export interface WindowEvent {
  change: 'focus'
  container: ConApp
}

export interface BindingEvent {
  change: 'run'
  binding: {
    command: string
    event_state_mask: string[] // ["Mod4"]
    input_code: number
    input_type: 'keyboard' | string
    mods: ("Mod4" | "shift")[] // ["Mod4", "shift", "..."]
    symbol: string // "1" ... "a" ...
  }
}

export type I3Event = BindingEvent | WindowEvent | WorkspaceEvent
