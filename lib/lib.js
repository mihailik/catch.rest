import * as CodeMirror6 from 'codemirror6';
import * as CodeMirror from 'codemirror';
import * as ts from 'typescript';

(function () {
  const lib = {
    CodeMirror, CodeMirror6, ts
  };
  console.log('lib ', window.lib = lib);
})();