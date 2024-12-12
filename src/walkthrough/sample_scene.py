from manimlib import *

# ❗
# ❗ First, make sure to save this file somewhere. Otherwise, nothing will work here.
# ❗


class MyFirstManimNotebook(Scene):
    def construct(self):
        ## Your first Manim Cell
        # Note how a Manim Cell is introduced by a comment starting with `##`.
        # You should see a button `Preview Manim Cell` above this cell.
        # Click on it to preview the animation.
        circle = Circle()
        circle.set_stroke(BLUE_E, width=4)
        self.play(ShowCreation(circle))

        ## Transform circle to square
        # You can also preview the cell with the default hotkey:
        # `Cmd+' Cmd+e` (MacOS) or `Ctrl+' Ctrl+e` (Windows/Linux)
        square = Square()
        self.play(ReplacementTransform(circle, square))

        ## Make it red and fly away
        self.play(
            square.animate.set_fill(RED_D, opacity=0.5),
            self.frame.animate.set_width(25),
        )

        # Now try to interact with the scene, e.g. press `d` and drag the mouse
        # (without any mouse buttons pressed) to rotate the camera.

        # Check out the Manim Quickstart Guide for more tips:
        # https://3b1b.github.io/manim/getting_started/quickstart.html

        # Many more example scenes can be found here:
        # https://3b1b.github.io/manim/getting_started/example_scenes.html

        # 🌟 Last but not least: if you like this extension, give it a star on
        # GitHub. That would mean a lot to us :) Feel free to also let us know
        # what we can improve. Happy Manim Animation! 🌈
        # https://github.com/Manim-Notebook/manim-notebook
