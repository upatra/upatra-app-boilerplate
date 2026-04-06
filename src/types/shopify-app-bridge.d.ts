import 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      's-link': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        href?: string
      }
      's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
