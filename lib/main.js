// @ts-check

/** @type {{
 *  CodeMirror: typeof import('codemirror');
 *  CodeMirror6: typeof import('codemirror6');
 *  ts: typeof import('typescript');
 *  ts_jsonp: typeof import('ts-jsonp');
 *  xlsx: typeof import('xlsx');
 * } | undefined} */
var lib;

if (typeof lib === 'undefined') {
  console.log('lib delayed...');
  lib = /** @type {*} */(function (lib_loaded) {
    console.log('lib loaded...');
    withDependencies(lib_loaded);
  });
} else {
  console.log('lib already...');
  withDependencies(lib);
}

/**
 * @param {NonNullable<typeof lib>} lib
 */
function withDependencies({ CodeMirror, CodeMirror6, ts, ts_jsonp, xlsx }) {
  const shellDiv = document.createElement('div');
  shellDiv.style.cssText = `
    position: absolute;
    left: 0; top: 0; width: 100%; height: 100%;
    padding: 4em;
  `;
  document.body.appendChild(shellDiv);

  const shellInner = document.createElement('div');
  shellInner.style.cssText = `
  width: 100%; height: 100%;
  overflow: auto;
  border: solid 3px tomato;
  `;

  shellDiv.appendChild(shellInner);

  const editor = new CodeMirror6.EditorView({
    extensions: [CodeMirror6.basicSetup],
    parent: shellInner
  });
}