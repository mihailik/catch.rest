import * as CodeMirror6 from 'codemirror6';

import * as CodeMirror from 'codemirror';

// CodeMirror (v5) modules
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/fold/foldcode.js';
import 'codemirror/addon/fold/foldgutter.js';
import 'codemirror/addon/fold/brace-fold.js';
// import 'codemirror/addon/fold/xml-fold.js';
import 'codemirror/addon/fold/indent-fold.js';
import 'codemirror/addon/fold/markdown-fold.js';
import 'codemirror/addon/fold/comment-fold.js';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/xml/xml.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/mode/htmlembedded/htmlembedded.js';
import 'codemirror/mode/http/http.js';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/mode/yaml/yaml.js';
import 'codemirror/mode/yaml-frontmatter/yaml-frontmatter.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/markdown/markdown.js';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/search/search.js';
import 'codemirror/addon/search/searchcursor.js';
import 'codemirror/addon/search/match-highlighter.js';
import 'codemirror/addon/search/matchesonscrollbar.js';
import 'codemirror/addon/search/matchesonscrollbar.css';
import 'codemirror/addon/search/jump-to-line.js';
import 'codemirror/addon/dialog/dialog.js';
import 'codemirror/addon/dialog/dialog.css';
import 'codemirror/addon/scroll/annotatescrollbar.js';
import 'codemirror/addon/edit/closebrackets.js';
// import 'codemirror/addon/edit/closetag.js';
import 'codemirror/addon/edit/continuelist.js';
import 'codemirror/addon/edit/matchbrackets.js';
// import 'codemirror/addon/edit/matchtags.js';
import 'codemirror/addon/edit/trailingspace.js';

import * as ts from 'typescript';
import * as ts_jsonp from 'ts-jsonp';
import * as xlsx from 'xlsx';
import * as markdown from 'markdown';

(function () {
  if (typeof catchREST === 'undefined')
    catchREST = { lib: {} };
  else if (!catchREST.lib) catchREST.lib = {};

  applyDependencies(catchREST.lib);

  if (typeof catchREST.lib === 'function') {
    catchREST.lib(catchREST.lib);
  }

  function applyDependencies(lib) {
    lib.CodeMirror = CodeMirror;
    lib.CodeMirror6 = CodeMirror6;
    lib.ts = ts;
    lib.ts_jsonp = ts_jsonp;
    lib.xlsx = xlsx;
    lib.markdown = markdown;
  }
})();