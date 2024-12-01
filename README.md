<div align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=bhoov.vscode-manim">
    <img src="./assets/logo.png" width="130px" alt="Manim Notebook Logo"/>
  </a>

  <div align="center">
    <h3 align="center">Manim Notebook</h3>
    <p>
      VSCode extension to interactively preview your Manim animations</strong>
    </p>
  </div>

  <div align="center">
    <a href="https://marketplace.visualstudio.com/items?itemName=bhoov.vscode-manim">VSCode Marketplace</a>
    | <a href="https://github.com/Manim-Notebook/manim-notebook/">GitHub</a>
  </div>
</div>


> [!warning]
> This VSCode extension is specifically for [3b1b's original manim library](https://github.com/3b1b/manim) and *NOT* the [Manim Community Edition (Manim CE)](https://www.manim.community/).


## 🎈 What is this?

Manim Notebook is a VSCode extension that tailors your needs when writing Python code to animate mathematical concepts with 3Blue1Brown's [Manim library](https://github.com/3b1b/manim). It's *NOT* a Jupyter Notebook; instead it enriches your existing Python files with interactive Manim cells that let you live-preview parts of the code and instantly see the animations.

Originally, the motivation for this extension was Grant Sanderson's video [How I animate 3Blue1Brown](https://youtu.be/rbu7Zu5X1zI?feature=shared) where he shows his Manim workflow in Sublime Text. This extension brings a similar workflow to VSCode but even goes further and provides a rich VSCode integration.


## 💻 Usage

Our VSCode **walkthrough** will guide you through the first steps. It should open automatically upon installation of [the Manim Notebook extension](https://marketplace.visualstudio.com/items?itemName=bhoov.vscode-manim). If not, you can invoke it manually: open the command palette (`Ctrl/Cmd + Shift + P`) and search for `Manim Notebook: Open Walkthrough`.

The main concept is that of a Manim Cell, which is just a regular Python comment, but one that starts with `##` instead of `#`.

![Preview Cell example](./src/walkthrough/preview-cell.svg)


## 💫 Customization

- There are some extension settings that you can tweak: just press `Ctrl/Cmd + ,` in order to open the settings and search for `Manim Notebook`.
- We also provide many default keyboard shortcuts. See them in the Manim Notebook walkthrough (`Manim Notebook: Open Walkthrough`). Or simply press `Ctrl/Cmd + K` and then `Ctrl/Cmd + S` to open the keyboard shortcuts editor and search for `Manim Notebook`.
- Customize the **color of the Manim Cells** in your `settings.json` file as [described here in the VSCode docs](https://code.visualstudio.com/docs/getstarted/themes#_customize-a-color-theme). Why not go for a more red-ish color? 🎨

```json
// https://stackoverflow.com/a/71962342/
// https://stackoverflow.com/a/77515370/
// Use `[*Light*]` to match themes whose name contains `Light` in them.
"workbench.colorCustomizations": {
    "[*Light*]": {
        "manimNotebookColors.baseColor": "#FF708A",
        "manimNotebookColors.unfocused": "#FFBFCC"
    },
    "[*Dark*]": {
        "manimNotebookColors.baseColor": "#FF708A",
        "manimNotebookColors.unfocused": "#804953"
    },
    "[*Light High Contrast*]": {
        "manimNotebookColors.baseColor": "#FF5473",
        "manimNotebookColors.unfocused": "#FFA3B6"
    },
    "[*Dark High Contrast*]": {
        "manimNotebookColors.baseColor": "#FF5473",
        "manimNotebookColors.unfocused": "#8C5660"
    }
}
```

<details>

<summary>See default blue-ish colors</summary>

```json
// https://stackoverflow.com/a/71962342/
// https://stackoverflow.com/a/77515370/
// Use `[*Light*]` to match themes whose name contains `Light` in them.
"workbench.colorCustomizations": {
    "[*Light*]": {
        "manimNotebookColors.baseColor": "#2B7BD6",
        "manimNotebookColors.unfocused": "#DCE9F7"
    },
    "[*Dark*]": {
        "manimNotebookColors.baseColor": "#64A4ED",
        "manimNotebookColors.unfocused": "#39506B"
    },
    "[*Light High Contrast*]": {
        "manimNotebookColors.baseColor": "#216CC2",
        "manimNotebookColors.unfocused": "#C3DDF7"
    },
    "[*Dark High Contrast*]": {
        "manimNotebookColors.baseColor": "#75B6FF",
        "manimNotebookColors.unfocused": "#3C5878"
    }
}
```

</details>


## 🤢 Troubleshooting

If you encounter an issue, search for some related keywords first in the [issues](https://github.com/bhoov/manim-notebook/issues). If you can't find anything, feel free to open a new issue. To analyze the problem, we need a **log file** from you:

- Open the command palette `Ctrl+Shift+P` (or `Cmd+Shift+P`)<br>and use the command `Manim Notebook: Record Log File`.
- Then set the log level by searching for `Manim Notebook` and selecting `Trace`.
- Now reproduce the issue, e.g. by running a command that causes the problem or previewing a certain Manim cell etc.
- Once you're done, click on the button in the status bar (bottom right) to finish recording. The log file will be opened afterwards.
- Drag-and-drop the log file into the GitHub issue text field (as a _file_, i.e. please don't copy-paste its _content_ because this would make it hard to read).
