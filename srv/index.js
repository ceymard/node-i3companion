const pth = require('path')
const fs = require('fs')
const cp = require('child_process')

const src = fs.readFileSync(pth.join(__dirname, '../ui/lib/app.js'), 'utf-8')
// console.log(src)

const gi = require('node-gtk')

const Gdk     = gi.require('Gdk')
const Gtk     = gi.require('Gtk', '3.0')
const WebKit2 = gi.require('WebKit2')

// Start the GLib event loop
gi.startLoop()

// Necessary to initialize the graphic environment.
// If this fails it means the host cannot show Gtk-3.0
Gtk.init()

var DEBUG = !!process.env.DEBUG

function main() {
  Gtk.main()
  // console.log('?!')
}

let _display_id = 0
let _total_open = 0
const display_map = new Map()
class Display {

  constructor(related) {
    _total_open++

    // We keep track of the displays that we inited
    _display_id++
    this.display_id = _display_id
    display_map.set(this.display_id, this)

    this.window = new Gtk.Window({ type : Gtk.WindowType.TOPLEVEL })
    this.webview = related ? WebKit2.WebView.newWithRelatedView(related) : new WebKit2.WebView()
    this.window.add(this.webview)

    // called whenever a window is completely closed
    this.window.on('destroy', () => {
      // this display should not be joinable anymore.
      console.log('destroying app')
      display_map.delete(this.display_id)
      this.webview.destroy()
      // this.webview.unref()
      _total_open--
      if (_total_open == 0) {
        Gtk.quit()
      }
    })

    // this callback is called whenever client code does <window>.open()
    this.webview.on('create', () => {
      const dsp = new Display(main_display.webview)
      dsp.floatCenter()
      dsp.show()
      dsp.window.setOpacity(0.95)
      console.log('creating')
      return dsp.webview
    })

    // called whenever the client code calls <window>.close()
    this.webview.on('close', () => {
      console.log('closing webview')
      this.window.close()
    })

    if (!related) {

      this.window.setDefaultSize(1920, 32)
      this.window.setResizable(true)
      this.window.setTypeHint(Gdk.WindowTypeHint.DOCK)

      // Only one display keeps the connection open
      const manager = this.webview.getUserContentManager()

      manager.on('script-message-received::external', (recv) => {
        const val = JSON.parse(recv.getJsValue().toJson(0))
        // console.log(val)
        this.handleRpc(val)
      })

      manager.registerScriptMessageHandler('external')

      // These two lines set the window at the bottom.
      // If nothing is done, it is set at 0, 0, or the top of the screen the bar was launched on.
      this.window.setGravity(Gdk.Gravity.SOUTH_WEST)
      this.window.move(0, 1080)

      this.window.showAll()
    }

    this.initJs()

    if (!related) {
      // run the initial client code
      this.webview.runJavascript(src)

      // let url = 'file://' + pth.join(__dirname, '../ui/index.html')
      // console.log(url)
      // this.webview.loadUri(url)
    }

    if (DEBUG) {
      // enable developer console if DEBUG flag is passed on the command line
      const settings = this.webview.getSettings()
      settings.setEnableWriteConsoleMessagesToStdout(true)
      settings.setEnableDeveloperExtras(true)
    }
  }

  floatCenter() {
    // FIXME : we should give the window more abilities to be able to set their position
    // than forcing it.
    this.window.setTypeHint(Gdk.WindowTypeHint.DIALOG)
    this.window.setDefaultSize(600, 400)
    this.window.setDecorated(false)
  }

  show() {
    this.window.showAll()
  }

  handleRpc(data) {
    const disp = display_map.get(data.display_id)
    console.log(data)
    if (data.cmd === 'run') {
      const args = data.args.cmd
      let obj = cp.execFile(args[0], args.slice(1), {

      }, (err, stdout, stderr) => {
        return disp.reply(data.id, { stderr: stderr, stdout: stdout }, err)
      })
      if (args.stdin) {
        obj.stdin.write(obj)
      }
      obj.stdin.end()
    } else if (data.cmd === 'i3.get_tree') {
      i3.tree((err, res) => {
        // console.log()
        disp.reply(data.id, res, err)
      })
    } else if (data.cmd === 'i3.get_workspaces') {
      i3.workspaces((err, res) => {
        // console.log()
        disp.reply(data.id, res, err)
      })
    } else if (data.cmd === 'i3') {
      // send a command to i3.
      i3.command(data.args, (err, res) => {
        disp.reply(data.id, res, err)
      })
    } else if (data.id) {
      disp.reply(data.id, null, `no such command ${data.cmd}`)
    }
    //
  }

  initJs() {
    this.webview.runJavascript(`
      (function () {
            let id = 0
            let display_id = ${this.display_id}
            let replies = new Map()
            let __ext = window.webkit.messageHandlers.external
            window.i3msg = function () { }
            let __rpc = window.__rpc = function (cmd, args) {
                id++
                __ext.postMessage({cmd, args, id: id, display_id: display_id})
                return new Promise(function (accept, reject) { replies.set(id, {accept: accept, reject: reject}) })
            }

            window.__rpc_reply = function (id, res, err) {
                let r = replies.get(id)
                if (!r) { console.error('could not get accept/reject for ', id); return }
                replies.delete(id)
                if (err != null) { return r.reject(err) }
                return r.accept(res)
            }
            window.__show = function () { __rpc('show') }
            window.__hide = function () { __rpc('hide') }
            if (window.__init) window.__init()
        })()
    `)
  }

  reply(id, res, err) {
    // console.log(id, res, err)
    if (err != null) {
      this.webview.runJavascript(`__rpc_reply(${id}, null, ${JSON.stringify({error: err, result: res})})`)
      return
    }
    this.webview.runJavascript(`__rpc_reply(${id}, ${JSON.stringify(res)}, null)`)
  }

  msg(kind, obj) {
    // console.log(kind, obj)
    this.webview.runJavascript(`i3msg(${JSON.stringify(kind)}, ${JSON.stringify(obj)})`)
  }

}


const main_display = new Display()
// main_display.show()


let i3 = require('i3').createClient()
i3.on('output', o => {
  main_display.msg('output', o)
})
i3.on('shutdown', d => {
  main_display.msg('shutdown', d)
  process.exit(0)
})
i3.on('workspace', wk => {
  // console.log(wk)
  main_display.msg('workspace', wk)
})
i3.on('window', wk => {
  // console.log(wk)
  main_display.msg('window', wk)
})
i3.on('binding', b => {
  if (b.binding.command.indexOf('nop i3c') !== 0) return;
  main_display.msg('binding', b)
})

// console.log(i3)

///////////////////////////////////////
main()
