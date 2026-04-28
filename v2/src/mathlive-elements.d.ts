import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type MathFieldElementAttributes = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  value?: string
  mode?: string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': MathFieldElementAttributes
      'math-div': MathFieldElementAttributes
    }
  }
}

