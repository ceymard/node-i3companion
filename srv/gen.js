const gi = require('node-gtk')

const Gtk     = gi.require('Gtk', '3.0')
const Gdk     = gi.require('Gdk')
const WebKit2 = gi.require('WebKit2')

// Start the GLib event loop
gi.startLoop()
// Necessary to initialize the graphic environment.
// If this fails it means the host cannot show Gtk-3.0
Gtk.init()
console.log(WebKit2)