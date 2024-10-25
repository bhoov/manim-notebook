"""
This script renders the scene that becomes the logo for the Manim Notebook extension.

```
pip install manimgl==1.7.1
manimgl scripts/make_manim_notebook_logo.py ManimNotebookLogo
```
"""
from manimlib import *
import os
from pathlib import Path

ASSETS = Path(
    os.path.abspath(__file__)
).parent.parent / "assets"

class ManimNotebookLogo(Scene):
    def construct(self):
        ## MathTex objects
        tex_of_M = Tex(r"\mathbb{M}", font_size=400).set_color(BLUE_C).set_opacity(0.5)
        glowdot = GlowDot(color=WHITE, radius=1.5, glow_factor=1.75).shift([0.94, 0.7,0])
        svg_of_notebook = SVGMobject(file_name=ASSETS / "NotebookLogoWhite.svg", stroke_width=9.).shift([0.,-0.15,0])
        self.play(Write(tex_of_M), Write(svg_of_notebook))
        self.add(glowdot)
