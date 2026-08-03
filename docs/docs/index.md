# Equation Forge

Equation Forge is an application for deriving formulas by direct manipulation.
Select part of an expression and drag it to a new location; Equation Forge
applies the corresponding algebraic rewrite and keeps a history of the
derivation.

Instead of retyping each line, you can:

- rearrange terms and factors;
- move expressions across an equality or inequality;
- factor, distribute, substitute, and simplify selected expressions;
- apply algebraic, trigonometric, logarithmic, and calculus identities;
- copy an equation, a selection, or the full derivation as LaTeX.

## Choose how to use it

### Standalone web application

Build and run Equation Forge locally in a browser. The standalone application
stores its equations in browser storage.

[Build the standalone application](getting-started.md#standalone-web-application)

### JupyterLab

Use Equation Forge inside JupyterLab through the
[JupyterLab Equation Forge extension](https://github.com/reubengann/jupyterlab-equation-forge).
The extension saves Equation Forge documents through JupyterLab rather than
browser storage.

## Start here

1. Follow [Getting started](getting-started.md) to open Equation Forge.
2. Work through [Your first derivation](tutorial.md).
3. Read [Core concepts](concepts.md) to understand selections and move modes.
4. Use the [Rewrite features](rewrite-features.md) page as a toolbar reference.

!!! note "Early-stage software"
    Equation Forge is under active development. It supports a broad range of
    symbolic expressions, but not every LaTeX construct or algebraic move is
    available yet. Unsupported input is generally preserved as an immutable
    expression rather than discarded.
