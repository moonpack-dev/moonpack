# VHS tape for moonpack build demo
# Run: cd demo && vhs ../assets/demo-build.tape

Output ../assets/demo-build.gif

Set Shell "bash"
Set FontSize 14
Set Width 600
Set Height 240
Set Theme "Catppuccin Mocha"
Set Padding 16
Set Framerate 60

Type "cat moonpack.json"
Enter
Sleep 1.5s

Type "moonpack build"
Enter
Sleep 2.5s
