# Getting started

Equation Forge can run as a standalone web application or as a JupyterLab
extension.

## Standalone web application

### Requirements

- A current version of [Node.js](https://nodejs.org/)
- npm (included with Node.js)

Clone the repository, then install the dependencies:

```bash
npm install
```

For local development, start the Vite development server:

```bash
npm run dev
```

Open the URL printed by Vite. Changes to the source are reflected in the
browser while the server is running.

To create a production build instead:

```bash
npm run build
```

The standalone application stores equations in the browser's local storage.
Clearing site data may therefore remove your saved equations.

## JupyterLab extension

The JupyterLab integration is maintained in the separate
[jupyterlab-equation-forge repository](https://github.com/reubengann/jupyterlab-equation-forge).
Follow that project's installation instructions to add Equation Forge to
JupyterLab.

## The equation pad

When Equation Forge opens, the pad contains one or more equation rows. Click a
row to make it active. Keyboard shortcuts and toolbar actions apply to the
active row.

Each row has two states:

- **Edit mode** uses MathLive to enter or change an expression.
- **Display mode** enables structural selection, dragging, and rewrites.

Use the edit/accept control on the row to switch between them. Pressing
<kbd>E</kbd> while a display row is active also opens it for editing.

## Entering expressions

Enter an expression using the MathLive editor, then accept it to return to
display mode. Equation Forge compiles the LaTeX into a structured expression
tree. That structure determines which parts can be selected and where they can
be moved.

If Equation Forge cannot interpret part of the input, it normally keeps that
part as an immutable expression. You can still preserve and copy the formula,
but structural rewrites may not be available for the unsupported fragment.

## Verify a source checkout

Contributors can run the main checks from the repository root:

```bash
npm run test:run
npm run mathtests
npm run build
```

`npm run mathtests` replays recorded drag-and-drop interactions in
`mathtests/fixtures`.

Next, try [Your first derivation](tutorial.md).
