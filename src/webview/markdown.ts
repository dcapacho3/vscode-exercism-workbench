import type { HLJSApi } from 'highlight.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MarkdownIt = require('markdown-it') as typeof import('markdown-it');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hljs: HLJSApi = require('highlight.js/lib/core').default ?? require('highlight.js/lib/core');

// The highlight.js core plus only the languages Exercism tracks use keeps the bundle small.
// Each require is static so esbuild bundles it; a dynamic require fails inside the VSIX.
/* eslint-disable @typescript-eslint/no-require-imports */
const LANGUAGES: Record<string, any> = {
  bash: require('highlight.js/lib/languages/bash'),
  c: require('highlight.js/lib/languages/c'),
  clojure: require('highlight.js/lib/languages/clojure'),
  coffeescript: require('highlight.js/lib/languages/coffeescript'),
  coq: require('highlight.js/lib/languages/coq'),
  cpp: require('highlight.js/lib/languages/cpp'),
  crystal: require('highlight.js/lib/languages/crystal'),
  csharp: require('highlight.js/lib/languages/csharp'),
  d: require('highlight.js/lib/languages/d'),
  dart: require('highlight.js/lib/languages/dart'),
  delphi: require('highlight.js/lib/languages/delphi'),
  diff: require('highlight.js/lib/languages/diff'),
  elixir: require('highlight.js/lib/languages/elixir'),
  elm: require('highlight.js/lib/languages/elm'),
  erlang: require('highlight.js/lib/languages/erlang'),
  fortran: require('highlight.js/lib/languages/fortran'),
  fsharp: require('highlight.js/lib/languages/fsharp'),
  go: require('highlight.js/lib/languages/go'),
  groovy: require('highlight.js/lib/languages/groovy'),
  haskell: require('highlight.js/lib/languages/haskell'),
  java: require('highlight.js/lib/languages/java'),
  javascript: require('highlight.js/lib/languages/javascript'),
  json: require('highlight.js/lib/languages/json'),
  julia: require('highlight.js/lib/languages/julia'),
  kotlin: require('highlight.js/lib/languages/kotlin'),
  lisp: require('highlight.js/lib/languages/lisp'),
  lua: require('highlight.js/lib/languages/lua'),
  makefile: require('highlight.js/lib/languages/makefile'),
  mipsasm: require('highlight.js/lib/languages/mipsasm'),
  nim: require('highlight.js/lib/languages/nim'),
  objectivec: require('highlight.js/lib/languages/objectivec'),
  ocaml: require('highlight.js/lib/languages/ocaml'),
  perl: require('highlight.js/lib/languages/perl'),
  php: require('highlight.js/lib/languages/php'),
  plaintext: require('highlight.js/lib/languages/plaintext'),
  powershell: require('highlight.js/lib/languages/powershell'),
  prolog: require('highlight.js/lib/languages/prolog'),
  python: require('highlight.js/lib/languages/python'),
  r: require('highlight.js/lib/languages/r'),
  reasonml: require('highlight.js/lib/languages/reasonml'),
  ruby: require('highlight.js/lib/languages/ruby'),
  rust: require('highlight.js/lib/languages/rust'),
  scala: require('highlight.js/lib/languages/scala'),
  scheme: require('highlight.js/lib/languages/scheme'),
  shell: require('highlight.js/lib/languages/shell'),
  smalltalk: require('highlight.js/lib/languages/smalltalk'),
  sml: require('highlight.js/lib/languages/sml'),
  sql: require('highlight.js/lib/languages/sql'),
  swift: require('highlight.js/lib/languages/swift'),
  tcl: require('highlight.js/lib/languages/tcl'),
  typescript: require('highlight.js/lib/languages/typescript'),
  vbnet: require('highlight.js/lib/languages/vbnet'),
  vim: require('highlight.js/lib/languages/vim'),
  wasm: require('highlight.js/lib/languages/wasm'),
  wren: require('highlight.js/lib/languages/wren'),
  xml: require('highlight.js/lib/languages/xml'),
  x86asm: require('highlight.js/lib/languages/x86asm'),
  yaml: require('highlight.js/lib/languages/yaml'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

const markdown = new MarkdownIt({
  // Exercism READMEs use raw HTML (tables, <br>); the panel's CSP blocks any script without its nonce.
  html: true,
  linkify: true,
  typographer: true,
  highlight: (code: string, language: string): string => {
    let body = markdown.utils.escapeHtml(code);
    if (language && hljs.getLanguage(language)) {
      try {
        body = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch { /* show the code unhighlighted */ }
    }
    return `<pre class="hljs"><code>${body}</code></pre>`;
  },
});

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
