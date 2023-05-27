var fs = require('fs');

var libjs = fs.readFileSync(__dirname + '/.dev-cache/lib.js', 'utf8');
var libjs_map = fs.readFileSync(__dirname + '/.dev-cache/lib.js.map', 'utf8');
var libcss = fs.readFileSync(__dirname + '/.dev-cache/lib.css', 'utf8');
var libcss_map = fs.readFileSync(__dirname + '/.dev-cache/lib.css.map', 'utf8');

var matchLastBreakBeforeSourcemap = /\/\/([^\n]*)(\s*)$/.exec(libjs);

var libjs_lead = libjs.slice(0, matchLastBreakBeforeSourcemap.index);
var libjs_trail = libjs.slice(matchLastBreakBeforeSourcemap.index);

var updatedLibjs =
  libjs_lead +
  '\n/*style inject START*/\n' +
  '(function() { var styleElem = document.createElement("style");\n' +
  'styleElem.innerHTML = ' + JSON.stringify(libcss) + ';\n' +
  '(document.head || document.body).insertBefore(styleElem, (document.head || document.body).firstChild); })();\n' +
  '/*style inject END*/\n\n' +
  libjs_trail;

console.log(
  '...' + libjs_lead.slice(-30) + '<...inject>' +
  libjs_trail.slice(0, 30));

fs.writeFileSync(__dirname + '/../lib.js', updatedLibjs);
fs.writeFileSync(__dirname + '/../lib.js.map', libjs_map);
fs.writeFileSync(__dirname + '/../lib.css.map', libcss_map);
