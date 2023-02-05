// @ts-check <script>
/// <reference path="./websql.d.ts" />
/// <reference types="codemirror" />

function catchREST() {

  // Debug! Temporary!
  if (typeof window !== 'undefined' && window) {
    window.onerror = function () {
      var txt = '';
      for (var i = 0; i < arguments.length; i++) {
        var add = String(arguments[i]);
        if (!txt || add.length <= 10) txt += ' ' + add;
        else if (txt.indexOf(add) >= 0) continue;
        else txt += '\n' + add;
      };
      alert(txt);
    };
  }

  // #region polyfills

  if (typeof document !== 'undefined' && document && !document.defaultView && typeof window !== 'undefined' && window) {
    // @ts-ignore
    document.defaultView = window;
  }

  if (typeof Promise === 'undefined') {
    Promise = /** @type {Partial<typeof Promise>} */(polyfillPromise());
  }

  if (typeof Object.defineProperty !== 'function') {
    // @ts-ignore
    Object.defineProperty =
      /**
       * @param {*} obj
       * @param {*} key
       * @param {*} attr
       */
      function (obj, key, attr) {
        obj['_get_' + key] = attr.get;
        obj[key] = function () {
          return obj['_get_' + key]();
        };
      };
  }

  if (typeof Object.keys !== 'function') {
    Object.keys = function (/** @type {any} */ obj) {
      var keys = [];
      for (var k in obj) {
        keys.push(k);
      }
      return keys;
    };
  }
  if (typeof Object.entries !== 'function') {
    Object.entries =
      /** @param {*} obj @returns {*} */
      function (obj) {
        var entries = [];
        for (var k in obj) {
          entries.push([k, obj[k]]);
        }
        return entries;
      };
  }
  if (typeof [].map !== 'function') {
    (function () {
      Array.prototype.map = function map(/** @type {(arg0: any, arg1: number, arg2: any[]) => any} */ callback) {
        var arr = this;
        var res = [];
        for (var i = 0; i < this.length; i++) {
          if (!(String(i) in arr)) continue;
          var elem = arr[i];
          var x = callback(elem, i, arr);
          res[i] = x;
        }
        return res;
      };
    })();
  }

  if (typeof [].filter !== 'function') {
    /** @type {*} */(Array.prototype).filter = function (/** @type {(arg0: any) => any} */ filt) {
      var arr = this;
      var res = [];
      for (var i = 0; i < this.length; i++) {
        if (!(String(i) in arr)) continue;
        var elem = arr[i];
        if (filt(elem)) {
          res.push(elem);
        }
      }
      return res;
    };
  }

  function polyfillPromise() {
    var queueCb = [];
    var queueArg = [];

    return Promise;

    /**
     * @param {{ (value: any): void; (error: any): void; }} callback
     * @param {any} arg
     */
    function queueNext(callback, arg) {
      var set = queueCb.length;
      queueCb.push(callback);
      queueArg.push(arg);

      if (!set) {
        if (typeof setImmediate === 'function') setImmediate(drainQueue);
        else setTimeout(drainQueue, 0);
      }
    }

    function drainQueue() {
      while (true) {
        var cb = queueCb.pop();
        var arg = queueArg.pop();
        if (!cb) break;
        cb(arg);
      }
    }

    /**
     * @param {{ (resolve: any, reject: any): void; (resolve: any, reject: any): void; (resolve: any, reject: any): any; (_resolve: any, reject: any): void; (resolve: any, _reject: any): void; (arg0: (value: any) => void, arg1: (error: any) => void): void; }} resolver
     */
    function Promise(resolver) {
      if (typeof resolver !== 'function') throw new Error('Expected function resolver: ' + typeof resolver);

      if (!(this instanceof Promise))
        return new Promise(resolver);

      var self = this;
      /** @type {'pending' | 'resolving' | 'fulfilled' | 'failed'} */
      var state = self['[[PromiseState]]'] = 'pending';
      var outcome;
      var cbOK, cbFail;

      /**
       * @param {globalThis.Promise<any>} value
       */
      function resolve(value) {
        if (state !== 'pending') return;

        if (value && typeof value.then === 'function') {
          self['[[PromiseState]]'] = state = 'resolving';
          value.then(
            function (/** @type {any} */ value) {
              self['[[PromiseState]]'] = state = 'fulfilled';
              outcome = value;
              complete();
            },
            function (/** @type {any} */ error) {
              self['[[PromiseState]]'] = state = 'failed';
              outcome = error;
              complete();
            });
        } else {
          self['[[PromiseState]]'] = state = 'fulfilled';
          outcome = value;
          complete();
        }
      }

      /**
       * @param {any} error
       */
      function reject(error) {
        if (state !== 'pending') return;
        self['[[PromiseState]]'] = state = 'failed';
        outcome = error;
        complete();
      }

      function complete() {
        var callbacks = state === 'fulfilled' ? cbOK : cbFail;
        cbOK = null;
        cbFail = null;
        if (!callbacks) return;

        for (var i = 0; callbacks && i < callbacks.length; i++) {
          queueNext(callbacks[i], outcome);
        }
      }

      /**
       * @param {(value: any) => any} callback
       * @param {Function} callbackFail
       */
      function Then(callback, callbackFail) {
        if (typeof callback !== 'function') throw new Error('Expected function callback: ' + typeof callback);
        if (callbackFail != null && typeof callbackFail !== 'function') throw new Error('Expected omitted or function callbackFail: ' + typeof callbackFail);

        return new Promise(function (/** @type {(arg0: any) => void} */ resolve, /** @type {(arg0: any) => void} */ reject) {
          if (state === 'fulfilled') queueNext(withOK, outcome);
          if (state === 'failed') queueNext(withFail, outcome);

          (cbOK || (cbOK = [])).push(withOK);

          if (typeof callbackFail !== 'function')
            (cbFail || (cbFail = [])).push(withFail);

          /**
           * @param {any} value
           */
          function withOK(value) {
            handleSettled(value, callback);
          }

          /**
           * @param {any} error
           */
          function withFail(error) {
            handleSettled(error, /** @type {*} */(callbackFail))
          }

          /**
           * @param {globalThis.Promise<any>} outcome
           * @param {(arg0: any) => any} callback
           */
          function handleSettled(outcome, callback) {
            try {
              outcome = callback(outcome);
              if (outcome && typeof outcome.then === 'function') {
                outcome.then(resolve, reject);
              } else {
                resolve(outcome);
              }

            } catch (error) {
              reject(error);
            }
          }
        });
      }

      /**
       * @param {any} callback
       */
      function Catch(callback) {
        return Then(function (/** @type {any} */ value) { return value; }, callback);
      }

      this.then = Then;
      this['catch'] = Catch;

      try {
        resolver(resolve, reject);
      } catch (error) {
        reject(error);
      }
    }

    Promise.all = all;
    Promise.race = race;
    Promise.reject = reject;
    Promise.resolve = resolve;

    /**
     * @param {string | any[]} arr
     */
    function all(arr) {
      return new Promise(function (/** @type {(arg0: any[]) => void} */ resolve, /** @type {(arg0: any) => void} */ reject) {
        if (!arr.length) { resolve([]); }
        var results = [];
        var toComplete = arr.length;
        for (var i = 0; i < arr.length; i++) {
          var pr = arr[i];
          if (pr && typeof pr.then === 'function') {
            pr.then(callbackFor(i), fail);
          } else {
            // element of input array is not promise, transfer it directly to results,
            // and decrement await counter
            results[i] = pr;
            toComplete--;
          }
        }

        // if no promises in input array, already resolve
        if (!toComplete) resolve(results);

        /**
         * @param {any} error
         */
        function fail(error) {
          toComplete = 0;
          results = /** @type {*} */(void 0);
          reject(error);
        }

        /**
         * @param {number} i
         */
        function callbackFor(i) {
          return function (/** @type {any} */ value) {
            if (!toComplete) return;

            results[i] = value;
            toComplete--;
            if (!toComplete) resolve(results);
          };
        }
      });
    }

    /**
     * @param {string | any[]} arr
     */
    function race(arr) {
      return new Promise(function (/** @type {(arg0: undefined) => void} */ resolve, /** @type {any} */ reject) {
        if (!arr) return /** @type {*} */(resolve)();
        for (var i = 0; i < arr.length; i++) {
          var pr = arr[i];
          if (pr && typeof pr.then === 'function') pr.then(resolve, reject);
            // if element of input array is not promise, already resolve
          else resolve(pr);
        }
      });
    }

    /**
     * @param {any} reason
     */
    function reject(reason) {
      return new Promise(function (/** @type {any} */ _resolve, /** @type {(arg0: any) => void} */ reject) {
        reject(reason);
      });
    }

    /**
     * @param {any} value
     */
    function resolve(value) {
      return new Promise(function (/** @type {(arg0: any) => void} */ resolve, /** @type {any} */ _reject) {
        resolve(value);
      });
    }

  }

  if (typeof Math.imul !== 'function') (function () {
    /**
     * @param {number} x
     * @param {number} y
     */
    function imul(x, y) {
      return (x * y) | 0;
    }
    Math.imul = imul;
  })();

  // #endregion

  // #region SHARED FUNCTIONALITY

  var drinkChar = '\ud83c\udf79';

  /**
   * @param {string} pathname
   * @param {string=} protocol
   * @param {string=} host
   */
  function getBaseUrl(pathname, protocol, host) {
    if (protocol && protocol.indexOf('file') >= 0) return; // running from local file, no need to adjust base URL
    var verb = getVerb(pathname);
    if (!verb) return; // no deep URL, no need to adjust base URL
    if (verb.verb === 'local') {
      // @ts-ignore
      catchREST_urlencoded = false;
    }

    var baseUrl = (protocol || '') + '//' + (host || '') + pathname.slice(0, verb.index);

    return baseUrl;
  }

  /** @param {Function} fn */
  function getFunctionCommentContent(fn) {
    return (fn + '').replace(
      getFunctionCommentContent.regex_functionShape,
      getFunctionCommentContent.takeContent
    ).replace(
      getFunctionCommentContent.regex_starSpaceSlash,
      '*' + '/' // just in case let's not put verbatim comments in string literals
    ).replace(
      getFunctionCommentContent.regex_slashSpaceStar,
      '/' + '*' // just in case let's not put verbatim comments in string literals
    );
  }
  getFunctionCommentContent.regex_functionShape = /^([\s\S\n\r]*\/\*\s*)([\s\S\n\r]*)(\s*\*\/[\s\r\n]*}[\s\r\n]*)$/;
  getFunctionCommentContent.takeContent = function (/** @type {any} */ _whole, /** @type {any} */ _lead, /** @type {string | null | undefined} */ content, /** @type {any} */ _tail) { return trimEnd(content); };
  getFunctionCommentContent.regex_starSpaceSlash = /\* \//g;
  getFunctionCommentContent.regex_slashSpaceStar = /\/ \*/g;

  /**
   * @param {() => void} fn
   */
  function getFunctionBody(fn) {
    return (fn + '').replace(getFunctionBody.regex_functionShape, getFunctionBody.takeContent);
  }
  getFunctionBody.takeContent = function (/** @type {any} */ _whole, /** @type {any} */ _lead, /** @type {string | null | undefined} */ content, /** @type {any} */ _tail) { return trimEnd(content); };
  getFunctionBody.regex_functionShape = /^([^{]*{\s*)([\s\S\n\r]*)(\s*}[\s\r\n]*)$/;

  /** @param {string | null | undefined} str */
  function trimEnd(str) {
    if (str == null) return '';
    return String(str).replace(trimEnd.regex_trailWS, '');
  }
  trimEnd.regex_trailWS = /[\r\n\s]+$/;


  function getTimeNow() {
    if (typeof Date.now === 'function') return Date.now();
    return +new Date();
  }

  /** @param {string} url */
  function parseEncodedURL(url) {
    var verbMatch = getVerb(url);
    if (!verbMatch) return;

    var encodedStr = url.slice(verbMatch.index);
    var posEndVerbSlash = encodedStr.indexOf('/');
    var verb;
    var verbPos = verbMatch.index;
    if (posEndVerbSlash >= 0) {
      verb = encodedStr.slice(0, posEndVerbSlash);
      encodedStr = encodedStr.slice(posEndVerbSlash + 1);
    } else {
      verb = encodedStr;
      encodedStr = '';
    }

    if (verb === 'http:' || verb === 'https:') {
      encodedStr = verb + '/' + encodedStr;
      verb = 'GET';
      verbPos = -1;
    }

    if (isPlainTextVerb(verb)) {
      addr = '';
      var body = parseEncodedURL.decodeBody(encodedStr);
    } else {

      var addr;
      var addrEndPos = encodedStr.indexOf('//');
      if (addrEndPos > 0 && encodedStr.charAt(addrEndPos - 1) === ':')
        addrEndPos = encodedStr.indexOf('//', addrEndPos + 2);
      if (addrEndPos >= 0) {
        addr = decodeURIComponent(encodedStr.slice(0, addrEndPos)); // TODO: unescape strange characters here?
        encodedStr = encodedStr.slice(addrEndPos + 2);
      } else {
        addr = decodeURIComponent(encodedStr);
        encodedStr = '';
      }

      var body = parseEncodedURL.decodeBody(encodedStr);
    }

    var result = {
      verb: verb,
      verbPos: verbPos,
      addr: addr,
      body: body
    };

    return result;
  }
  parseEncodedURL.decodeBody = (function () {

    /**
     * @param {string} bodyRaw
     * @returns {string}
     */
    function decodeBody(bodyRaw) {
      var body = bodyRaw.replace(
        /([^\/\+]*)((\/)|(\+))?/gi,
        function (whole, plain, remain, slash, plus) {
          return decodeURIComponent(plain || '') + (
            slash ? '\n' :
              plus ? ' ' :
                (remain || '')
          );
        }
      );

      return body;
    }

    return decodeBody;
  })();

  /**
   * @param {string} verb
   */
  function isPlainTextVerb(verb) {
    return verb === 'edit' || verb === 'view';
  }

  /**
   * @param {string} verb
   * @param {string} url
   * @param {string} body
   */
  function makeEncodedURL(verb, url, body) {
    if (!verb) {
      if (url) {
        if (!/^(http|https):/i.test(url)) verb = 'GET';
      }
      else verb = 'edit';
    }

    if (verb) {
      var normalizedUrl = !url ? '' :
        encodeURI(url)
          .replace(
            /(^http:)|(^https:)|(\/\/)|(#)|(\&)|(\?)/gi,
            function (whole, httpPrefix, httpSecurePrefix, slash, hash, ampersand, question) {
              return (
                slash ? '/%2F' :
                  hash ? '%23' :
                    ampersand ? '%26' :
                      question ? '%3F' :
                        whole
              );
            });
    } else {
      var normalizedUrl = !url ? '' :
        encodeURI(url)
          .replace(
            /(^http:(\/\/)?)|(^https:(\/\/)?)|(\/\/)|(#)|(\&)|(\?)/gi,
            function (whole, httpPrefix, httpSecurePrefix, httpSlash2, httpsSlash2, slash, hash, ampersand, question) {
              return (
                slash ? '/%2F' :
                  hash ? '%23' :
                    ampersand ? '%26' :
                      question ? '%3F' :
                        whole
              );
            });
    }

    var normalizedBody = body
      .replace(
        /([^\n\/\+ \#\&\?]*)((\n)|(\/)|(\+)|( )|(#)|(\&)|(\?))/gi,
        function (whole, plain, remain, newLine, slash, plus, space, hash, ampersand, question) {
          return encodeURI(plain || '') + (
            newLine ? '/' :
              slash ? '%2F' :
                plus ? '%2B' :
                  space ? '+' :
                    hash ? '%23' :
                      ampersand ? '%26' :
                        question ? '%3F' :
                          (remain || '')
          );
        }
      );

    var result =
      isPlainTextVerb(verb) ? verb + '/' + normalizedBody :
        (verb ? verb + '/' : '') + (normalizedUrl ? normalizedUrl : '') + (
          (normalizedBody && (verb || normalizedUrl)) ? '//' + normalizedBody : normalizedBody || ''
        );
    return result;
  }

  /** @param {string | undefined | null} requestText */
  function parseTextRequest(requestText) {
    if (!requestText) return;
    var firstNonwhitespace = /\S/.exec(requestText);
    if (!firstNonwhitespace) return;

    var firstLineStart = requestText.lastIndexOf('\n', firstNonwhitespace.index) + 1;

    var leadEmptyLines = requestText.slice(0, firstLineStart);
    var firstLineEnd = requestText.indexOf('\n', firstLineStart);
    if (firstLineEnd < 0) firstLineEnd = requestText.length;
    var firstLine = requestText.slice(firstLineStart, firstLineEnd);
    var body = firstLineEnd < requestText.length ? requestText.slice(firstLineEnd + 1) : '';
    var bodySeparator = firstLineEnd < requestText.length ? requestText.slice(firstLineEnd, firstLineEnd + 1) : '';
    return {
      leadEmptyLines: leadEmptyLines,
      firstLine: firstLine,
      bodySeparator: bodySeparator,
      body: body
    };
  }

  /** @param {string} firstLine */
  function parseFirstLine(firstLine) {
    var verbMatch = /^(\s*)(local|read|edit|view|browse|shell|get|post|put|head|delete|option|connect|trace)(\s+|$)/i.exec(firstLine + '');
    if (!verbMatch) {
      var url = firstLine.replace(/^\s+/, '');
      var urlPos = firstLine.length - url.length;
      if (url.indexOf('http:') === 0 || url.indexOf('https:') === 0) {
        url = url.replace(/\s+$/, '');
        if (!url || /\s/.test(url)) return; // do not allow whitespace inside implied verb-less URL

        return {
          verb: 'GET',
          url: url,
          verbPos: -1,
          urlPos: urlPos
        };
      }

      // neither HTTP verb matched, nor URL
      return;
    }

    var leadWhitespace = verbMatch[1] || '';
    var verb = verbMatch[2];

    // capitalised verb (first word) is a strong sign of just normal text
    if (verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() === verb) return;

    var urlRest = firstLine.slice(leadWhitespace.length + verb.length);
    var url = urlRest.replace(/^\s+/, '');
    var urlPos = leadWhitespace.length + verb.length + urlRest.length - url.length;
    url = url.replace(/\s+$/, '');

    if (!url) return; // empty URL is not good

    return {
      verb: verb,
      url: url,
      verbPos: leadWhitespace.length,
      urlPos: urlPos
    };
  }

  /** @param {string | null | undefined} path */
  function getVerb(path) {
    var verbMatch = /(^|\/)(local|read|edit|view|browse|shell|get|post|put|head|delete|option|connect|trace|http:|https:)(\/|$)/i.exec(path + '');
    return verbMatch ? { leadingSlash: verbMatch[1], verb: verbMatch[2], trailingSlash: verbMatch[3], index: verbMatch.index + (verbMatch[1] ? 1 : 0) } : void 0;
  }

  /**
   * @param {string} str
   * @param {number | undefined} [seed]
   */
  function calcHash(str, seed) {
    if (!seed) seed = 0;
    var h1 = 0xdeadbeef ^ seed,
      h2 = 0x41c6ce57 ^ seed;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  /**
   * @param {string} text
   * @param {ReturnType<typeof createTypeScriptLanguageService>} lang
   */
  function parseJsonLike(text, lang) {
    var asJson = /^\s*\{/.test(text) && /\}\s*$/.test(text);
    var madeUpFilename = asJson ? '/file.json' : '/file.js';
    lang.setScriptText(madeUpFilename, text);
    var prog = lang.languageService.getProgram();
    var script = /** @type {import('typescript').SourceFile} */(prog && prog.getSourceFile('/' + madeUpFilename));
    if (!script) {
      script = lang.ts.createLanguageServiceSourceFile(
        madeUpFilename,
        lang.ts.ScriptSnapshot.fromString(text.replace(/\s+$/, '')),
        lang.ts.ScriptTarget.Latest,
        lang.ts.version,
        true,
        asJson ? lang.ts.ScriptKind.JSON : lang.ts.ScriptKind.JSX
      );

      if (typeof console !== 'undefined' && console && typeof console.log === 'function')
        console.log('No script for ' + madeUpFilename, prog);
    }

    var highlights = /** @type {import('typescript').ClassifiedSpan[]} */(lang.languageService.getSyntacticClassifications(
      madeUpFilename,
      { start: 0, length: text.length },
      lang.ts.SemanticClassificationFormat.Original
    ));

    /** @type {import('typescript').Node} */
    var topMostNode = script;

    var nodeSpans = [{
      pos: script.pos,
      node: /** @type {import('typescript').Node} */(script)
    }];
    /** @type {import('typescript').Node[]} */
    var nameNodes = [];
    var spanBestStart = 0;

    var nodeParents = [];

    lang.ts.forEachChild(script, visitNodeOuter);

    /** @type {(typeof nodeSpans[0] & { highlight: string, text: string })[]} */
    var highlightSpans = [];
    var iHighlight = 0;
    for (var iNodeSpan = 0; iNodeSpan < nodeSpans.length; iNodeSpan++) {
      var sp = nodeSpans[iNodeSpan];
      var spEnd = iNodeSpan < nodeSpans.length - 1 ? nodeSpans[iNodeSpan + 1].pos : text.length;

      if (highlights[iHighlight].textSpan.start > sp.pos) {
        highlightSpans.push({
          pos: sp.pos,
          node: sp.node,
          highlight: '',
          text: ''
        });
      }

      while (iHighlight < highlights.length) {
        var hl = highlights[iHighlight];
        if (hl.textSpan.start > spEnd) break;

        highlightSpans.push({
          pos: Math.max(sp.pos, hl.textSpan.start),
          node: sp.node,
          highlight: hl.classificationType,
          text: ''
        });

        iHighlight++;
      }
    }

    for (var iHighlight = 0; iHighlight < highlightSpans.length; iHighlight++) {
      var hlsp = highlightSpans[iHighlight];
      hlsp.text =
        iHighlight < highlightSpans.length - 1 ?
          text.slice(hlsp.pos, highlightSpans[iHighlight + 1].pos) :
          text.slice(hlsp.pos);
    }

    for (var iNameNode = 0; iNameNode < nameNodes.length; iNameNode++) {
      var node = nameNodes[iNameNode];
      var iHighlight = findPosSpan(node.pos, highlightSpans);
      while (iHighlight < highlightSpans.length) {
        var hlsp = highlightSpans[iHighlight];
        if (hlsp.pos >= node.end) break;

        var quoteMatch = /^(\s*\")(.+)(\"\s*)$/.exec(hlsp.text);

        if (quoteMatch) {
          var leadQ = highlightSpans[iHighlight] = Object.assign({}, hlsp);
          leadQ.text = quoteMatch[1];
          leadQ.highlight += ' property-name property-name-quote';

          var trailQ = Object.assign({}, hlsp);
          trailQ.text = quoteMatch[3];
          trailQ.pos = hlsp.pos + hlsp.text.length - trailQ.text.length;
          trailQ.highlight += ' property-name property-name-quote';

          hlsp.pos += leadQ.text.length;
          hlsp.highlight += ' property-name';
          hlsp.text = quoteMatch[2];

          highlightSpans.splice(iHighlight + 1, 0, hlsp, trailQ);
          iHighlight += 3;
        } else {
          hlsp.highlight += ' property-name';
          iHighlight++;
        }
      }
    }

    if (typeof console !== 'undefined' && console && typeof console.log === 'function')
      console.log('highlights ', highlightSpans);

    return {
      script: script,
      topMostNode: topMostNode,
      lineStarts: script.getLineStarts(),
      getSpanIndexAt: getSpanIndexAt,
      getSpanAt: getSpanAt,
      spans: highlightSpans
    };

    function getSpanIndexAt(pos) {
      return findPosSpan(pos, highlightSpans);
    }

    function getSpanAt(pos) {
      return nodeSpans[findPosSpan(pos, highlightSpans)];
    }

    /** @param {import('typescript').Node} node */
    function visitNodeOuter(node) {
      visitNode(node);
      nodeParents.push(node);
      lang.ts.forEachChild(node, visitNodeOuter);
      nodeParents.pop();
    }

    /** @param {import('typescript').Node} node */
    function visitNode(node) {
      var leading = node.getLeadingTriviaWidth(script);
      if (node.pos - leading === script.pos && node.end === script.end) topMostNode = node;

      updateNodeSpans(node);

      if (lang.ts.isArrayLiteralExpression(node)) {

      } else if (lang.ts.isObjectLiteralExpression(node)) {

      } else if (lang.ts.isPropertyAssignment(node)) {
        if (lang.ts.isStringLiteralLike(node.name)) {
          nameNodes.push(node.name);
        }
      }

    }

    /** @param {import('typescript').Node} node */
    function updateNodeSpans(node) {
      if (node.end === node.pos) return;

      var spanIndex = findPosSpan(node.pos, nodeSpans);
      var parentSpan = nodeSpans[spanIndex];

      var peekBefore = node.pos - parentSpan.pos;
      var peekAfter = parentSpan.pos + parentSpan.length - node.end;

      if (peekBefore) {
        if (peekAfter) {
          nodeSpans.splice(spanIndex + 1, 0,
            { pos: node.pos, node: node },
            { pos: parentSpan.start + parentSpan.length - peekAfter, node: parentSpan.node });
        } else {
          nodeSpans.splice(spanIndex + 1, 0,
            { pos: node.pos, node: node });
        }
      } else {
        if (peekAfter) {
          nodeSpans.splice(spanIndex, 0,
            { pos: node.pos, node: node });
          parentSpan.pos = node.end;
        } else {
          parentSpan.node = node;
          parentSpan.pos = node.pos;
        }
      }
    }

    /**
     * @param {number} pos
     * @param {{pos: number}[]} nodeSpans
     */
    function findPosSpan(pos, nodeSpans) {
      var mid = spanBestStart;
      var start = 0, end = nodeSpans.length;
      while (true) {
        if (pos < nodeSpans[mid].pos) {
          end = mid;
        } else if (mid < nodeSpans.length - 1 && pos >= nodeSpans[mid + 1].pos) {
          var start = mid +1;
        } else return mid;
        mid = ((start + end) / 2) | 0;
      }
    }
  }

  /** @param {import('typescript')} ts */
  function createTypeScriptLanguageService(ts) {

    var host = {
      getCompilationSettings,
      getScriptFileNames,
      getScriptVersion,
      getScriptSnapshot,
      getCurrentDirectory,
      getDefaultLibFileName,
      readFile,
      fileExists
    };

    /** @type {{
     * [fileName: string]: {
     *    name: string;
     *    text: string;
     *    snapshot: import('typescript').IScriptSnapshot;
     *    version: string;
     *  }
     * }} */
    var scripts = {};

    /** @type {string[]} */
    var scriptFileNames = [];

    var ls = ts.createLanguageService(host);

    var lang = {
      ts: ts,
      options: ts.getDefaultCompilerOptions(),
      languageService: ls,
      setScriptText: setScriptText
    };
    lang.options.resolveJsonModule = true;
    lang.options.esModuleInterop = true;
    lang.options.allowJs = true;
    lang.options.checkJs = true;

    return lang;

    /**
     * @param {string} name
     * @param {string} text
     */
    function setScriptText(name, text) {
      var script = scripts[name];
      if (script) {
        if (script.text === text) return;
        script.text = text;
        script.snapshot = ts.ScriptSnapshot.fromString(text);
        script.version = String(Number(script.version) + 1);
      } else {
        script = {
          name: name,
          text: text,
          snapshot: ts.ScriptSnapshot.fromString(text),
          version: '0'
        };
        scripts[name] = script;
        scriptFileNames.push(name);
      }
    }

    function getCompilationSettings() {
      return lang.options;
    }

    function getScriptFileNames() {
      return scriptFileNames;
    }

    /** @param {string} file */
    function getScriptVersion(file) {
      var script = scripts[file];
      return script ? script.version : '';
    }

    /** @param {string} file */
    function getScriptSnapshot(file) {
      var script = scripts[file];
      return script && script.snapshot;
    }

    function getCurrentDirectory() {
      return '/';
    }

    function getDefaultLibFileName() {
      return '/~lib.d.ts';
    }

    function readFile(file) {
      var script = scripts[file];
      return script && script.text;
    }

    function fileExists(file) {
      return !!scripts[file];
    }

  }

  //#endregion SHARED FUNCTIONALITY

  // #region UNICODE-STYLING

  var variants = {
    bold: { AZ: '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭', az: '𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇', '09': '𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵' },
    italic: { AZ: '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡', az: '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻' },
    bolditalic: { AZ: '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕', az: '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯' },
    fractur: { AB: '𝔄𝔅', C: 'ℭ', DG: '𝔇𝔈𝔉𝔊', HI: 'ℌℑ', JQ: '𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔', R: 'ℜ', SY: '𝔖𝔗𝔘𝔙𝔚𝔛𝔜', Z: 'ℨ', az: '𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷' },
    boldfractur: { AZ: '𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅', az: '𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟' },
    cursive: { AZ: '𝒜𝐵𝒞𝒟𝐸𝐹𝒢𝐻𝐼𝒥𝒦𝐿𝑀𝒩𝒪𝒫𝒬𝑅𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵', az: '𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏' }, // TODO: handle cursive B, E, F, H, I, L, M, R
    boldcursive: { AZ: '𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩', az: '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃' },
    'super': { AP: 'ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾ', Q: 'ᴼ̴', RW: 'ᴿˢᵀᵁⱽᵂ', ap: 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖ', q: '٩', rz: 'ʳˢᵗᵘᵛʷˣʸᶻ', '09': '⁰¹²³⁴⁵⁶⁷⁸⁹' },
    box: { AZ: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉' },
    plate: { AZ: '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉' },
    round: { AZ: 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ', az: 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ', '09': '⓪①②③④⑤⑥⑦⑧⑨' },
    typewriter: { AZ: '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉', az: '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣', '09': '𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿' },
    wide: {
      AB: '𝔸𝔹', C: 'ℂ', DG: '𝔻𝔼𝔽𝔾', H: 'ℍ', IM: '𝕀𝕁𝕂𝕃𝕄', N: 'ℕ', O: '𝕆', PR: 'ℙℚℝ', SY: '𝕊𝕋𝕌𝕍𝕎𝕏𝕐', Z: 'ℤ',
      az: '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫', '09': '𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡'
    }
  };

  /** @type {ReturnType<typeof createUnicodeFormattedParser>} */
  var _parseRanges;

  /** @type {ReturnType<typeof createUnicodeFormattedParser>} */
  function runParseRanges(text, options) {
    if (!_parseRanges)
      if (!_parseRanges) _parseRanges = createUnicodeFormattedParser();
    var parsed = _parseRanges(text, options);
    return parsed;
  }

  /**
 * @param text {string}
 * @param modifier {string}
 * @param remove {boolean=}
 **/
  function applyModifier(text, modifier, remove) {
    var parsed = runParseRanges(text, { disableCoalescing: true });
    var text = '';

    for (var iRange = 0; iRange < parsed.length; iRange++) {
      var range = parsed[iRange];

      if (typeof range === 'string') {
        if (remove) {
          text += range;
        } else {
          var rangeMap = variants[modifier];
          if (!rangeMap && modifier !== 'underlined') {
            // strange modifier???
            text += range;
          } else {
            for (var iChar = 0; iChar < range.length; iChar++) {
              // range is an ASCII string, iterate for each character
              var ch = range.charAt(iChar);
              var formattedCh = applyModifierToPlainCh(ch, [modifier]);
              text += formattedCh;
            }
          }
        }
      } else {
        /** @type {string} */
        var applyFullModifiers;
        if (remove) {
          if (range.modifiers.indexOf(modifier) < 0) {
            // formatted, but not with this modifier — not removing anything
            text += range.formatted;
            continue;
          } else if (range.modifiers.length === 1) {
            // last modifier to be removed, simply reduce back to ASCII unformatted
            text += range.plain;
            continue;
          } else {
            applyFullModifiers = range.modifiers.filter(function (mod) { return mod !== modifier; }).join('');
          }
        } else {
          applyFullModifiers = range.modifiers.indexOf(modifier) < 0 ?
            range.modifiers.concat([modifier]).sort().join('') :
            range.fullModifiers;
        }

        var formattedCh = applyModifierToPlainCh(
          range.plain,
          applyFullModifiers === modifier ? [modifier] : [applyFullModifiers, modifier]);
        text += formattedCh;
      }
    }

    return text;
  }

  /**
   * @param {string} text
   * @param {number} start
   * @param {number} end
   * @returns {{
   *  text: string;
   *  start: number;
   *  end: number;
   *  parsed: ReturnType<typeof runParseRanges>;
   * } | undefined};
   */
  function getModifiersTextSection(text, start, end) {
    var modText = text;
    if (start !== end) {
      modText = modText.slice(start, end);
      return { text: modText, start: start, end: end, parsed: runParseRanges(modText, void 0) };
    }

    var consequentMatch = /\S+\s*$/.exec(text.slice(0, start));
    var consequentEntryStart = start - (consequentMatch ? consequentMatch[0].length : 0);

    if (!consequentMatch || !consequentMatch[0]) {
      // if cannot find consequent BEFORE, try consequent AFTER
      consequentMatch = /^\s*\S+/.exec(text.slice(start));
      if (!consequentMatch) return { text: '', start: start, end: start, parsed: runParseRanges('', void 0) };
      var parsed = runParseRanges(consequentMatch[0], void 0);
      var consequentEntry = parsed[0];
    } else {
      var parsed = runParseRanges(consequentMatch[0], void 0);
      var consequentEntry = parsed[parsed.length - 1];
    }

    if (!parsed.length) return { text: '', start: start, end: start, parsed: parsed };

    // pick previous if this is punctuation or whitespace after formatted word
    if (typeof consequentEntry === 'string' && parsed && parsed.length > 1) {
      var prevConsequentEntry = parsed[parsed.length - 2];
      if (consequentEntry.indexOf('\n') < 0 &&
        typeof prevConsequentEntry !== 'string' &&
        consequentEntry == applyModifier(consequentEntry, prevConsequentEntry.fullModifiers)) {
        consequentEntry = prevConsequentEntry;
      }
    }


    if (consequentMatch && consequentMatch[0]) {
      if (consequentEntry) {
        parsed.length = 1;
        parsed.modifiers = typeof consequentEntry === 'string' ? [] : consequentEntry.modifiers;
        parsed.fullModifiers = typeof consequentEntry === 'string' ? '' : consequentEntry.fullModifiers;
        parsed[0] = consequentEntry;
      } else {
        parsed.length = 0;
        parsed.modifiers = [];
        parsed.fullModifiers = '';
      }

      return {
        text: typeof consequentEntry === 'string' ? consequentEntry : consequentEntry.formatted,
        start: consequentEntryStart,
        end: consequentEntryStart + consequentEntry.length,
        parsed: parsed
      };
    }

    return { text: '', start: start, end: start, parsed: runParseRanges('', void 0) };
  }

  var regex_underlined = /underlined/g;

  /**
   * @param plainCh {string}
   * @param modifierAndFallbacks {string[]}
   **/
  function applyModifierToPlainCh(plainCh, modifierAndFallbacks) {
    // underlined is handled separately
    if (modifierAndFallbacks.length === 1 && modifierAndFallbacks[0] === 'underlined') return plainCh + '\u0332';

    for (var iMod = 0; iMod < modifierAndFallbacks.length; iMod++) {
      var mod = modifierAndFallbacks[iMod];

      // again, underlined is handled separately
      var underlined = regex_underlined.test(mod);
      if (underlined) mod = mod.replace(regex_underlined, '');
      if (!mod && underlined) {
        return plainCh + '\u0332';
      }

      var rangeMap = variants[mod];
      if (!rangeMap) continue;

      var formattedRange = rangeMap[plainCh];
      if (formattedRange) return formattedRange;

      for (var asciiRange in rangeMap) {
        var formattedRange = rangeMap[asciiRange];
        if (typeof formattedRange === 'string' && plainCh.charCodeAt(0) >= asciiRange.charCodeAt(0) && plainCh.charCodeAt(0) <= asciiRange.charCodeAt(1)) {
          // found respective range in modifier entry, pick corresponding formatted character
          var formattedIndex = plainCh.charCodeAt(0) - asciiRange.charCodeAt(0);
          var formattedUnit = formattedRange.length / (asciiRange.charCodeAt(1) - asciiRange.charCodeAt(0) + 1);
          var formattedChar = formattedRange.slice(formattedIndex * formattedUnit, (formattedIndex + 1) * formattedUnit);
          if (underlined) formattedChar += '\u0332';
          return formattedChar;
        }
      }
    }

    return plainCh;
  }

  var regex_escapeableRegexChars = /[#-.]|[[-^]|[?|{}]/g;

  /** @param str {string} */
  function sanitizeForRegex(str) {
    var sanitized = str.replace(regex_escapeableRegexChars, '\\$&');
    return sanitized;
  }


  function createUnicodeFormattedParser() {

    /** @typedef {{ formatted: string, plain: string, modifiers: string[], fullModifiers: string }} LookupEntry */

    /** @type {{ [formatted: string]: (LookupEntry & {underlinedModifiers: string[], underlinedFullModifiers: string}) }} */
    var lookup = {};

    /** @type {RegExp} */
    var formattedRegex;

    var regex_underlinedChar = /[^\r\n]\u0332/g;

    function buildLookups() {
      /** @type {LookupEntry[]} */
      var lookupList = [];

      for (var modKind in variants) {
        var rangeMap = variants[modKind];
        if (!rangeMap || typeof rangeMap !== 'object') continue;

        var modifiers = modKind === 'bold' || modKind.indexOf('bold') ? [modKind] : ['bold', modKind.slice(4)];
        var underlinedModifiers = modifiers.concat(['underlined']);
        var underlinedFullModifiers = modKind + 'underlined';

        for (var rangeDesc in rangeMap) {
          var rangeChars = rangeMap[rangeDesc];
          if (!rangeChars || typeof rangeChars !== 'string') continue;

          var rangeCount = rangeDesc.length === 1 ? 1 : rangeDesc.charCodeAt(1) - rangeDesc.charCodeAt(0) + 1;
          var formattedWidth = rangeChars.length / rangeCount;
          for (var i = 0; i < rangeCount; i++) {
            var ascii = String.fromCharCode(rangeDesc.charCodeAt(0) + i);
            var rangeCh = rangeChars.slice(i * formattedWidth, (i + 1) * formattedWidth);
            var entry = {
              formatted: rangeCh,
              plain: ascii,
              modifiers: modifiers,
              underlinedModifiers: underlinedModifiers,
              fullModifiers: modKind,
              underlinedFullModifiers: underlinedFullModifiers
            };
            lookupList.push(entry);
            lookup[entry.formatted] = entry;
          }
        }
      }

      lookupList.sort(function (entry1, entry2) {
        return -(entry1.formatted.length - entry2.formatted.length);
      });

      formattedRegex = new RegExp(lookupList.map(function (entry) {
        var sanitizedEntry = sanitizeForRegex(entry.formatted);
        var underlineEntry = sanitizedEntry + '\u0332';
        return underlineEntry + '|' + sanitizedEntry;
      }).join('|'), 'g');
    }

    /** @typedef {(string | (LookupEntry & { length: number }))[] & { modifiers: string[], fullModifiers: string }} ParsedList */

    /**
     * @param {string} text
     * @param {{ disableCoalescing?: boolean }=} options
     **/
    function parser(text, options) {

      /**
       * @param start {number}
       * @param end {number}
       **/
      function addUnderlinedsAndPlainTextBetween(start, end) {
        while (start < end) {
          regex_underlinedChar.lastIndex = start;
          var matchUnderlined = regex_underlinedChar.exec(text);
          if (!matchUnderlined || matchUnderlined.index >= end) {
            addFormattedToResult(text.slice(start, end));
            break;
          }

          if (matchUnderlined.index > start) addFormattedToResult(text.slice(start, matchUnderlined.index));

          var underlinedText = matchUnderlined[0];
          var plain = underlinedText.slice(0, underlinedText.length - 1);

          var added = false;
          if (!disableCoalescing) {
            var prevEntry = result.length && result[result.length - 1];
            if (prevEntry && typeof prevEntry !== 'string' && prevEntry.fullModifiers === 'underlined') {
              added = true;
              prevEntry.formatted += underlinedText;
              prevEntry.plain += plain;
              prevEntry.length += underlinedText.length;
            }
          }

          if (!added) {
            addFormattedToResult({
              formatted: underlinedText,
              plain: plain,
              modifiers: ['underlined'],
              fullModifiers: 'underlined',
              length: underlinedText.length
            });
          }

          if (result.modifiers.indexOf('underlined') < 0) result.modifiers.push('underlined');

          start = matchUnderlined.index + underlinedText.length;
        }
      }

      var regex_formattableCharacters = /[a-z0-9]/;

      /** @param {typeof result[0]} entry */
      function addFormattedToResult(entry) {
        var prev = result.length && result[result.length - 1];

        if (!disableCoalescing) {
          if (typeof entry === 'string') {
            if (typeof prev === 'string') {
              result[result.length - 1] = prev + entry;
              return;
            }
          } else if (prev) {
            if (typeof prev === 'string') {
              var nextPrev = result.length > 1 && result[result.length - 2];
              if (nextPrev && typeof nextPrev !== 'string' &&
                nextPrev.fullModifiers === entry.fullModifiers &&
                !regex_formattableCharacters.test(prev) && prev.indexOf('\n') < 0) {
                nextPrev.formatted += prev + entry.formatted;
                nextPrev.plain += prev + entry.plain;
                nextPrev.length += prev.length + entry.length;
                result.pop(); // plain text in the middle eliminated
                return;
              }
            }
            else if (prev.fullModifiers === entry.fullModifiers) {
              prev.formatted += entry.formatted;
              prev.plain += entry.plain;
              prev.length += entry.length;
              return;
            }
          }
        }

        if (typeof entry !== 'string' && (!prev || typeof prev === 'string' || prev.fullModifiers !== entry.fullModifiers))
          for (var i = 0; i < entry.modifiers.length; i++) {
            var mod = entry.modifiers[i];
            if (!modifierDict[mod]) {
              modifierDict[mod] = true;
              result.modifiers.push(mod);
            }
          }

        result.push(entry);
      }

      /** @type {ParsedList} */
      var result = /** @type{*} */([]);
      result.modifiers = [];
      result.fullModifiers = '';
      if (!text) return result;

      var disableCoalescing = options && options.disableCoalescing;

      var modifierDict = {};

      formattedRegex.lastIndex = 0;
      var index = 0;
      while (true) {
        formattedRegex.lastIndex = index;
        var match = formattedRegex.exec(text);
        if (!match) break;

        if (match.index > index) {
          addUnderlinedsAndPlainTextBetween(index, match.index);
          // result.push(text.slice(index, match.index));
        }

        var underlined = false;

        var entryKey = match[0];
        if (entryKey.charCodeAt(entryKey.length - 1) === ('\u0332').charCodeAt(0)) {
          entryKey = entryKey.slice(0, entryKey.length - 1);
          underlined = true;
        }

        var entry = lookup[entryKey];
        var prev = result.length && result[result.length - 1];

        var modifiers = !underlined ? entry.modifiers : entry.underlinedModifiers;
        var fullModifiers = !underlined ? entry.fullModifiers : entry.underlinedFullModifiers;

        addFormattedToResult({
          formatted: match[0],
          plain: entry.plain,
          modifiers: modifiers,
          fullModifiers: fullModifiers,
          length: match[0].length
        });

        index = match.index + match[0].length;
      }

      if (index < text.length) {
        addUnderlinedsAndPlainTextBetween(index, text.length);
      }

      result.modifiers.sort();
      result.fullModifiers = result.modifiers.join('');

      return result;
    }

    buildLookups();

    return parser;
  }

  // #endregion

  // #region EMBEDDED RESOURCES

  var catchREST_hash = calcHash(catchREST + '').toString(36);

  var embeddedMinCSS_authenticityMarker;
  var embeddedMinCSS = (function () {
    var embeddedMinCSS = getFunctionCommentContent(function () {/*
html {
  box-sizing: border-box;
  margin:0;padding:0;
  width:100%;height:100%;

  background: #235368; color: white;
  font-family:
    "Note Sans Math", "Note Emoji", "Noto Sans Symbols", "Noto Sans Symbols 2", "Note Sans",
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Arial Unicode";
}
*, *:before, *:after {
  box-sizing: inherit;
}

body {
  margin:0;padding:0;
  width:100%;height:100%;
  overflow:hidden;
  font-family:
    "Note Sans Math", "Note Emoji", "Noto Sans Symbols", "Noto Sans Symbols 2", "Note Sans",
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Arial Unicode";
}
#shell .CodeMirror {
  position: absolute;
  left: 0; top: 0;
  width: 100%; height: 100%;
  font: inherit;
  background: transparent;
}

.CodeMirror .cm-req-verb {
  padding: 0.2em;
  padding-top: 0.1em;
  margin: -0.2em;
  margin-top: -0.1em;
  background: #ff00d833;
  border-radius: 0.5em;
  font-weight: bold;
}

.CodeMirror .cm-req-url {
  text-decoration: underline;
  color: royalblue;
}

.CodeMirror .cm-req-header {
  color: gray;
  font-size: 85%;
}

#shell .CodeMirror-wrap pre.CodeMirror-line, .CodeMirror-wrap pre.CodeMirror-line-like {
  text-indent: -3em;
  padding-left: 3.3em;
}

#shell .CodeMirror .CodeMirror-lines {
  background: white;
}

#shell .CodeMirror-code pre.CodeMirror-line .lined-paper {
  display: none;
  position: absolute;
  left: 0;
  top: 100%;
  width: 100%;
  height: 20000%;
  / * this is LINED-PAPER * /
}

#shell #requestEditorHost .CodeMirror-wrap pre.CodeMirror-line, .CodeMirror-wrap pre.CodeMirror-line-like {
  / * this is LINED-PAPER * /
  border-bottom: solid 1px #f0f0f0;
  border-bottom-color: rgba(147, 142, 142, 0.14);
}

#shell #requestEditorHost .CodeMirror-code pre.CodeMirror-line .lined-paper {
  background: repeating-linear-gradient(to bottom, #f0f0f0, #f0f0f0 1px, white 1px, white 1.25em);
  / * this is LINED-PAPER * /
}

#shell .bottomHost .CodeMirror-code pre.CodeMirror-line .lined-paper {
  background: white;
}

#shell .CodeMirror-gutters {
  background: transparent; / * #225368 * /
  border: none;
}

#shell .CodeMirror-linenumber {
  color: #5ab1be;
  font-weight: 300;
}
#shell .CodeMirror-linenumber {
  min-width: 4em;
}

#shell #contentPageHost {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
}

#shell #contentPageHost #requestEditorHost {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
}

#shell #contentPageHost #splitterOuter {
  background: linear-gradient(to right, #225368 5em, #347c8d);
}

#shell #contentPageHost #splitter {
  box-shadow: 1em 0.2em 0.7em rgb(0 0 0 / 68%);
  padding-left: 0.6em;
  cursor: ns-resize;
}

#shell #contentPageHost #splitterLabel {
  padding-left: 1em;
  color: #98e0e9;
}

#shell .tabs-headers-container .tab-header {
  border: solid 1px currentColor;
  border-radius: 0.7em;
  border-bottom: none;
  padding: 1em;
  padding-top: 0.5em;
  padding-bottom: 0.35em;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  display: inline-block;
  background: linear-gradient(to right, currentColor -50%, transparent 400%);
  box-shadow: -4px -3px 40px black;
  cursor: pointer;
  margin-right: 0.8em;
}

#shell .tabs-headers-container .tab-header .tab-label {
  color: white;
  text-shadow: -1px -1px 2px #00000054
}

#shell .tabs-headers-container .tab-header.inactive {
  transform: translateY(0.4em);
  opacity: 0.7;
}

#shell .tabs-headers-container .tab-header.inactive .tab-label {
  transform: translateY(-0.15em);
}

#shell .tab-content.bottom-raw-reply .CodeMirror-lines {
  background: #eee;
}

#shell .tab-content.bottom-raw-reply .CodeMirror-lines pre {
  border-bottom: solid 1px #f0f0f0;
  border-bottom-color: rgba(147, 142, 142, 0.14);
}

#shell .tab-content.bottom-raw-reply .CodeMirror-lines pre .lined-paper {
  background: repeating-linear-gradient(to bottom, #ddd, #ddd 1px, #eee 1px, #eee 1.25em);
}

#shell .tab-content.bottom-structured-reply .CodeMirror-lines {
  background: #e1fdff;
}

#shell .tab-content.bottom-structured-reply .CodeMirror-lines pre {
  border-bottom: solid 1px #6ae8ff;
  border-bottom-color: rgba(0, 107, 212, 0.14);
}

#shell .tab-content.bottom-structured-reply .CodeMirror-lines pre .lined-paper {
  background: repeating-linear-gradient(to bottom, #c0f3ff, #c0f3ff 1px, #e1fdff 1px, #e1fdff 1.25em);
}


#shell .CodeMirror-guttermarker-subtle {
  color: #ffdc22;
  filter: drop-shadow(0px 0px 2px black);
  transform: scale(1.8) translate(1px, -1px);
}

#shell #pseudoGutter {
  border-right: solid 1px #e4e4e4;
  background: #225368;
  color: #5ab1be;

  position: absolute;
  left: 0; top: 0;
  height: 100%; width: 6.3em;
  text-align: right;
  padding-top: 0.25em;
  padding-right: 0.8em;
}

#shell #pseudoEditor {
  font: inherit;
  width: 100%; height: 100%;
  border: none;
  padding: 0.25em;
  padding-left: 4.6em;
  margin-left: 2em;
  outline: none;
}

#shell #leftBar {
  background: transparent; / * #0c4d69 * /
}

#shell #leftBar #leftTop {
  position: relative;
  height: 100%;
}

#shell #leftBar #leftTop > * {
  position: relative;
  pointer-events: auto;
}

#shell .goButton {
  border-radius: 100%;
  width: 4em;
  height: 4em;
  margin-top: 1em;
  margin-left: 0.6em;
  border: solid 1px #870000;
  background: #f5adad;
  box-shadow: inset 2px 2px 3px white, inset -2px -2px 3px #963232, 3px 3px 8px #00405c;
  cursor: pointer;
  color: #7f053c;
  text-shadow: -1px -1px 2px #4101017d, 1px 1px 2px #ffffffba;
}

.bottomHost .CodeMirror .CodeMirror-line  {
  font-size: 85%;
}

#shell #editorModeSidebar {
  / * Firefox * /
  scrollbar-width: none;

  / * Internet Explorer 10+ * /
  -ms-overflow-style: none;

  padding-top: 0.2em;
}
#shell #editorModeSidebar::-webkit-scrollbar {
  / * WebKit * /
  width: 0;
  height: 0;
}

#shell #editorModeSidebar button {
  border-radius: 100%;
  width: 7em;
  height: 7em;
  margin-top: 0.5em;
  margin-left: 0.8em;
  border: solid 1px #4a739f;
  background: #b5dbe0;
  box-shadow: inset 2px 2px 3px white, inset -2px -2px 3px #327285, 3px 3px 8px #00405c;
  cursor: pointer;
  color: #103a5f;
  text-shadow: -1px -1px 2px #011a418a, 1px 1px 2px #ffffffba;
  font-size: 60%;
  transition: box-shadow 200ms, background 150ms, color 200ms, border 200ms;
}

#shell #editorModeSidebar button .symbol-formatted {
  font-size: 340%;
  position: relative;
  top: 0.08em;
  left: -0.02em;
}

#shell #editorModeSidebar button#italic .symbol-formatted { left: -0.07em; }
#shell #editorModeSidebar button#cursive .symbol-formatted { left: 0.1em; }
#shell #editorModeSidebar button#box .symbol-formatted { left: 0.05em; top: 0.08em; }
#shell #editorModeSidebar button#plate .symbol-formatted { top: 0.14em; }
#shell #editorModeSidebar button#typewriter .symbol-formatted { left: 0.14em; }
#shell #editorModeSidebar button#typewriter .mod-button-content {
  position: relative;
  left: -0.4em;
}

#shell #editorModeSidebar button .mod-button-content {
  display: block;
  transform: none;
  transition: transform 100ms;
}

#shell #editorModeSidebar button#cursive .mod-button-content {
  position: relative;
  left: -0.5em;
}

#shell #editorModeSidebar button.pressed {
  border: solid 1px #3e6b9c;
  background: #103443;
  box-shadow: inset 3px 4px 6px #040a0d, inset -3px -3px 12px #30576c, 3px 3px 8px #0f6a92;
  color: #6691b6;
  text-shadow: 2px 2px 4px #011a41eb, -1px -1px 2px rgba(255, 255, 255, 0.43);
}

#shell #editorModeSidebar button.pressed .mod-button-content {
  transform: translate(2px, 2px);
}

#shell .CodeMirror pre .cm-property-name {
  color: #08acbb;
}

#shell .CodeMirror pre .cm-property-name-quote {
  color: #73e5ef;
}


  */});
    embeddedMinCSS_authenticityMarker = calcHash(embeddedMinCSS).toString(36);
    // font inherit is here to avoid empty CSS rule causing IDE warnings
    embeddedMinCSS += '\n.cssAuthenticityMarker{font: inherit; /' + '* {hex:' + embeddedMinCSS_authenticityMarker + '} *' + '/}';
    return embeddedMinCSS;
  })();

  var embeddedShellLayoutHTML = getFunctionCommentContent(function () { /*

<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto Sans Math">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto Sans">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto Emoji">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto Sans Symbols">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto Sans Symbols 2">

<div id=shell style="position: fixed; left: 0; top: 0; width: 100%; height: 100%;  padding-left: 0.2em;">

  <div id=leftBar style="position: absolute; left: 0; top: 0; height: 100%; width: 0.25em;">
    <table style="width: 100%; height: 100%; position: absolute; z-index: 100000; pointer-events: none;" cellspacing=0 cellpadding=0>
    <tr><td valign=top id=leftTop height="99%">
      <!-- top sidebar -->
    </td></tr>
    <tr><td id=leftMiddle>
      <!-- middle sidebar -->
    </td></tr>
    <tr><td valign=bottom id=leftBottom>
      <!-- bottom sidebar -->
      &#x1F379; Loading...
    </td></tr></table>
  </div>

  <div style="position: relative; width: 100%; height: 100%;">
    <div id=contentPageHost>
      <div id=requestEditorHost>
        <div id="pseudoGutter">1</div>
        <textarea id="pseudoEditor">
        </textarea>
      </div>
    </div>
  </div>

</div>
  */});

  var embeddedReadmeSplashMarkdown = getFunctionCommentContent(function () {/*
# This is a prototype project code name Catch REST &#x1F379;

>  Using Open Source libraries:
>   * [CodeMirror](https://github.com/codemirror/codemirror5/blob/master/LICENSE)
>   * [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt)
>   * [XLSX a.k.a. SheetJS](https://github.com/SheetJS/sheetjs/blob/master/LICENSE)

## How to use &#x1F379;

Click here, and this README disappears letting you type.

First of all, you can send HTTP requests, pass parameters, inspect responses.

Whatever you type is captured as part of the URL in the address bar, easy to pass around!

![HTTP POST request and reply](post-request-reply-screen.png)

### Formats auto-detection

Catch REST &#x1F379; doesn't only do HTTP requests, you can just use it as a simple Notes app.

To make it even cooler, I've implemented formatting for plain text.

Wait, formatting for {bolditalic:plain text}??

Oh yes, wicked Unicode magic.

*{cursive:Ka chi fo}!*

  */}).replace(/\{([a-z]+)\:([^\}]+)\}/g, function (_str, modifier, text) { return applyModifier(text, modifier); });

  var embeddedSplashText = embeddedReadmeSplashMarkdown.replace(/&#x1F379;/g, drinkChar);
  var embeddedSplashReadmeMarkdownWithScript = embeddedReadmeSplashMarkdown +
    '\n<script src="./index.js"></script>'

  var embeddedTtyWtfSplashMarkdown_get = function () {
    var thumbsup = '\ud83d\udc4d';
    return (
      applyModifier('ty', 'boldunderlined') + applyModifier('pe', 'bold') + ' ' +
      applyModifier('any', 'cursive') + ' ' + applyModifier('text', 'italic') + ', ' +
      applyModifier('apply', 'typewriter') + ' ' + applyModifier('formatting', 'wide') +
      '\n\n' +
      'Copy-paste into text field in any social media or raw text files ' + thumbsup
    );
  }

  var embeddedMetaBlockHTML = getFunctionCommentContent(function () {/*
<meta charset="UTF-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta property="og:title" content="Catch Rest">
<meta property="og:type" content="article" />
<meta property="og:description" content="Catch Rest">
<meta name="twitter:image:alt" content="Catch Rest">
<meta name="twitter:card" content="summary_large_image">
  */});

  var embeddedAdjustUrlencodedBaseURL =
    'catchREST_urlencoded = true; (function() {\n' +
    getFunctionBody(function () {
      var baseUrl = getBaseUrl(location.pathname, location.protocol, location.host);
      if (baseUrl) {
        var inject = '<base href="' + baseUrl + '">';
        document.write(inject);
      }
    }) + '\n\n' +
    getBaseUrl + '\n' +
    getVerb + '\n' +
    '})()';

  /**
   * @param {boolean=} urlencoded Whether trigger URLENCODED option inside the script
   * @param {string=} verbPlaceholder Verb that will likely render this page
   */
  function getEmbeddedWholeHTML(urlencoded, verbPlaceholder) {
    /** @type {Partial<typeof process>} */
    var pr = typeof process !== 'undefined' && process || {};
    var html =
      '<!' + 'DOCTYPE html' + '><' + 'html lang="en"' +
      '><' + 'head' + '>\n' +
      '<!-- {build-by-hash:' + catchREST_hash + ' ' + new Date() + ' with  ' + pr.platform + '/' + pr.arch + '} -->\n' +
      embeddedMetaBlockHTML + '\n' +
      '<title>Catch Rest &#x1F379;</title>\n' +

      '<' + 'script' + '>\n' +
      (urlencoded ? embeddedAdjustUrlencodedBaseURL + '\n' : '') +
      '</' + 'script' + '>\n' +

      '<style>\n' +
      embeddedMinCSS + '\n' +
      '</style>\n' +

      '</' + 'head' + '><' + 'body' + '>' +

      embeddedShellLayoutHTML + '\n\n' +

      '<' + 'script' + ' src="index.js"></' + 'script' + '>\n' +
      '<' + 'script' + ' src="lib.js"></' + 'script' + '>\n' +

      '<' + 'script' + '>\n' +
      'catchREST("page");\n' +
      '</' + 'script' + '>\n' +

      '<' + 'script' + ' src="ts.js"></' + 'script' + '>\n' +
      '</' + 'body' + '></' + 'html' + '>';

    return html;
  }

  // #endregion EMBEDDED RESOURCES

  /** @param {NodeModule=} module */
  function runAsNode(module) {
    var fs = require('fs');
    var path = require('path');
    var child_process = require('child_process');
    var http = require('http');
    var https = require('https');
    var URL = require('url');

    /** @type {(() => void | (Promise<void>))[]} */
    var shutdownServices = [];
    var runningChildProcesses = [];

    var catchREST_secret_variable_name = 'catchREST_secret';
    var shared_process_secret = /** @type {string} */(process.env[catchREST_secret_variable_name]);
    if (!shared_process_secret) {
      shared_process_secret = calcHash(__dirname.toLowerCase()) + '-' + Math.random().toString(36).replace(/[\.+-,]/g, '') + '-' + Math.random().toString(36).replace(/[\.+-,]/g, '');
    }

    /** @typedef {import('http').IncomingMessage} HTTPRequest */
    /** @typedef {import('http').ServerResponse} HTTPResponse */

    // #region COMMON NODE UTILS

    /**
     * @param {string} file
     * @param {string=} encoding
     */
    function readFileAsync(file, encoding) {
      return new Promise(function (resolve, reject) {
        fs.readFile(file, { encoding: encoding === 'buffer' ? void 0: typeof encoding === 'undefined' ? 'utf8' : /** @type {BufferEncoding} */(encoding) }, function (err, text) {
          if (err) reject(err);
          else resolve(text);
        });
      })
    }

    /**
     * @param {string} file
     * @param {string | Buffer} content
     * @returns {Promise<void>}
     */
    function writeFileAsync(file, content) {
      return new Promise(function (resolve, reject) {
        fs.writeFile(file, content, function (err) {
          if (err) reject(err);
          else resolve();
        })
      });
    }

    /**
     * @param {string} str
     */
    function derivePort(str) {
      str = String(str).toLowerCase();
      var hash = calcHash(str);
      var port = 4000 + (hash % 4000);
      return port;
    }

    //#endregion

    function build() {
      // verify the build result

      var imports = [
        'codemirror/lib/codemirror.js',
        'codemirror/lib/codemirror.css',

        'codemirror/addon/fold/foldcode.js',
        'codemirror/addon/fold/foldgutter.js',
        'codemirror/addon/fold/brace-fold.js',
        'codemirror/addon/fold/xml-fold.js',
        'codemirror/addon/fold/indent-fold.js',
        'codemirror/addon/fold/markdown-fold.js',
        'codemirror/addon/fold/comment-fold.js',
        'codemirror/mode/javascript/javascript.js',
        'codemirror/mode/xml/xml.js',
        'codemirror/mode/css/css.js',
        'codemirror/mode/htmlmixed/htmlmixed.js',
        'codemirror/mode/htmlembedded/htmlembedded.js',
        'codemirror/mode/http/http.js',
        'codemirror/mode/sql/sql.js',
        'codemirror/mode/yaml/yaml.js',
        'codemirror/mode/yaml-frontmatter/yaml-frontmatter.js',
        'codemirror/mode/python/python.js',
        'codemirror/mode/markdown/markdown.js',
        'codemirror/addon/fold/foldgutter.css',
        'codemirror/addon/search/search.js',
        'codemirror/addon/search/searchcursor.js',
        'codemirror/addon/search/match-highlighter.js',
        'codemirror/addon/search/matchesonscrollbar.js',
        'codemirror/addon/search/matchesonscrollbar.css',
        'codemirror/addon/search/jump-to-line.js',
        'codemirror/addon/dialog/dialog.js',
        'codemirror/addon/dialog/dialog.css',
        'codemirror/addon/scroll/annotatescrollbar.js',
        'codemirror/addon/edit/closebrackets.js',
        'codemirror/addon/edit/closetag.js',
        'codemirror/addon/edit/continuelist.js',
        'codemirror/addon/edit/matchbrackets.js',
        'codemirror/addon/edit/matchtags.js',
        'codemirror/addon/edit/trailingspace.js',


        // DISABLE XLSX for now
        // 'xlsx/dist/xlsx.full.min.js',

        // this one is not available, apparently
        //'xlsx/jszip.js'

        // DISABLE for now
        'typescript/lib/typescript.js'
        // include lib.d.ts here? probably no
      ];

      var indexHTML_path = path.resolve(__dirname, 'index.html');
      var index404HTML_path = path.resolve(__dirname, '404.html');
      var libJS_path = path.resolve(__dirname, 'lib.js');
      var libTS_path = path.resolve(__dirname, 'ts.js');
      var libDTS_path = path.resolve(__dirname, 'ts-libdts.js');
      var readme_path = path.resolve(__dirname, 'README.md');

      function detectLocalBuildValid() {
        return new Promise(function (resolve) {
          var markerRegexp = new RegExp('\\{build-by-hash:' + catchREST_hash);
          var indexHTMLPromise = readFileAsync(indexHTML_path);
          var index404HTMLPromise = readFileAsync(index404HTML_path);
          var libJSPromise = readFileAsync(libJS_path);
          var readmePromise = readFileAsync(readme_path);
          Promise.all([indexHTMLPromise, index404HTMLPromise, libJSPromise, readmePromise]).then(
            function (result) {
              var indexHTML_content = result[0];
              var index404HTML_content = result[1];
              var libJS_content = result[2];
              var readme_content = result[3];
              resolve(
                markerRegexp.test(indexHTML_content) &&
                markerRegexp.test(index404HTML_content) &&
                markerRegexp.test(libJS_content) &&
                markerRegexp.test(readme_content));
            },
            function () {
              // failed to read
              resolve(false);
            });
        });
      }

      function readLocalImports() {
        var importReads = imports.map(function (importLocalPath) {
          var fullPath = path.resolve(__dirname, 'node_modules', importLocalPath);
          return readFileAsync(fullPath).then(function (content) {
            return {
              importLocalPath: importLocalPath,
              fullPath: fullPath,
              content: content
            };
          });
        });

        return Promise.all(importReads);
      }

      function readUnpkgImports() {
        var importDownloads = imports.map(function (importLocalPath) {
          return new Promise(function (resolve, reject) {
            var maxRemainingRedirects = 10;
            getFromUrl('http://unpkg.com/' + importLocalPath);

            /**
             * @param {string} url
             */
            function getFromUrl(url) {
              var req = /^https/i.test(url) ? https.get(url) : http.get(url);
              var buffers = [];
              req.on('data', function (data) {
                buffers.push(data);
              });
              req.on('error', function (err) {
                reject(err);
              });
              req.on('response',
                function (res) {
                  if (res.statusCode === 301 || res.statusCode === 302
                    && res.headers.location
                    && maxRemainingRedirects) {
                    maxRemainingRedirects++;
                    process.stdout.write(url + ' --> ' + res.headers.location + '...');
                    if (!res.headers.location) return reject(new Error('HTTP/' + res.statusCode + ' without Location header.'));
                    getFromUrl(res.headers.location);
                    return;
                  }

                  if (res.statusCode !== 200) reject(new Error('HTTP/' + res.statusCode + ' ' + res.statusMessage));
                });
              req.on('end', function (res) {
                var wholeData = buffers.length === 1 ? buffers[0] : Buffer.concat(buffers);
                resolve({
                  importLocalPath: importLocalPath,
                  content: wholeData.toString('utf8')
                });
              });
            }
          });
        });

        return Promise.all(importDownloads);
      }

      /**
       * @param {{ importLocalPath: string; fullPath?: string | undefined; content: string; }[]} imports
       */
      function combineLib(imports) {
        var tsCombined;
        var libCombined = [];

        for (var i = 0; i < imports.length; i++) {
          var importEntry = imports[i];

          var processedContent = undefined;
          switch (path.extname(importEntry.importLocalPath).toLowerCase()) {
            case '.js':
              if (/typescript/i.test(importEntry.importLocalPath)) {
                var tsProcessedContent = strictES3(importEntry.importLocalPath, importEntry.content);
                // Disabling as it may destabilise TS: concatenate most TypeScript namespaces
                // tsProcessedContent = processedContent.replace(/\}\)\(ts\s*\|\|\s*\(ts\s*=\s*\{\}\)\);\s*(((\s*\/\/[^\n]*\n)|(\s*\/\*+[^\*]*\*\/))*)\s*var\s*ts;\s*\(function\s*\(ts\)\s*\{/g, '\n\n$1\n');

                // This causes errors:  exclude 'ts.' prefix to refer to values within ts namespace directly
                // tsProcessedContent = processedContent.replace(/([^.])\bts\./g, '$1');

                if (tsCombined) tsCombined.push(tsProcessedContent);
                else tsCombined = [tsProcessedContent];
                continue;
              }

              processedContent = importEntry.content;
              if (/codemirror\.js/i.test(importEntry.importLocalPath)) {
                processedContent = patchCodeMirror(processedContent);
              }
              else if (/\bcodemirror\b/i.test(importEntry.importLocalPath)
                && /\bcss\b/i.test(importEntry.importLocalPath)) {
                processedContent = patchCodeMirrorCSS(processedContent);
              }
              else if (/\bcodemirror\b/i.test(importEntry.importLocalPath)
                && /\bhtmlmixed\b/i.test(importEntry.importLocalPath)) {
                processedContent = patchCodeMirrorHtmlMixed(processedContent);
              }

              if (processedContent) processedContent +=
                '// #region ' + path.basename(importEntry.importLocalPath).replace(/\.js$/, '') + '\n' + processedContent + '\n' + '// #endregion';
              break;

            case '.css':
              processedContent = (
              '///// ' + path.basename(importEntry.importLocalPath) + ' /////\n' +
              '(function(value) { var style = document.createElement("style");\n' +
              'if ("styleSheet" in style && "type" in style) {\n' +
              ' style.type = "text/css";\n' +
              ' style.styleSheet.cssText = value;\n' +
              '} else {\n' +
              ' style.innerHTML = value;\n' +
              '}\n' +
              '(document.body || document.getElementsByTagName("head")[0]).appendChild(style); })(' + JSON.stringify(importEntry.content) + ');\n'
            );
          }

          if (processedContent) libCombined.push(processedContent);
        }

        return {
          lib:
            '// {build-by-hash:' + catchREST_hash + ' ' + new Date() + ' with  ' + process.platform + '/' + process.arch + '}\n' +
            libCombined.join('\n\n'),
          ts:
            tsCombined &&
            tsCombined.join('\n\n') + '\n\n\n' +
            '// {build-by-hash:' + catchREST_hash + ' ' + new Date() + ' with  ' + process.platform + '/' + process.arch + '}\n'
        };
      }

      /**
       * @param {string} libText
       */
      function patchCodeMirror(libText) {
        var replacedText = (libText
          .replace(
            getFunctionCommentContent(function () {/*
on(div, "touchstart", function () { return input.forceCompositionEnd(); });
        */}),
            getFunctionCommentContent(function () {/*
on(div, "touchstart", function () {
  input.forceCompositionEnd(true)
  input.lastTap = +new Date()
})
        */ })
        )

          .replace(
            getFunctionCommentContent(function() {/*
      on(d.scroller, "touchstart", function (e) {
      if (!signalDOMEvent(cm, e) && !isMouseLikeTouchEvent(e) && !clickInGutter(cm, e)) {
        d.input.ensurePolled();
            */}),
            getFunctionCommentContent(function() {/*
      on(d.scroller, "touchstart", function (e) {
      if (!signalDOMEvent(cm, e) && !isMouseLikeTouchEvent(e) && !clickInGutter(cm, e)) {
        d.input.ensurePolled(true);
            */})
        )

          .replace(
            getFunctionCommentContent(function() {/*
  ContentEditableInput.prototype.ensurePolled = function () {
    this.forceCompositionEnd();
  };
            */}),
            getFunctionCommentContent(function() {/*
  ContentEditableInput.prototype.ensurePolled = function (cancellable) {
    this.forceCompositionEnd(cancellable);
  };
            */})
          )

          .replace(
            getFunctionCommentContent(function () {/*
  ContentEditableInput.prototype.forceCompositionEnd = function () {
        */}),
            getFunctionCommentContent(function () {/*
  ContentEditableInput.prototype.forceCompositionEnd = function (cancellable) {
    if (cancellable) {
      if (+new Date() < this.lastTap - 400) return
      var cm = this.cm;
      var startPos = cm.indexFromPos(cm.getCursor('from'))
      var endPos = cm.indexFromPos(cm.getCursor('to'))
      if (startPos !== endPos) return // do not force composition during selection
    }
          */ })
        )

        );

        if (replacedText === libText) console.log('CodeMirror was not patched: version incompatible.');
        return replacedText;
      }

      /**
       * @param {string} libText
       */
      function patchCodeMirrorCSS(libText) {
        return (libText
          .replace(
            '"glyph-orientation-vertical", "text-anchor", "writing-mode",\n',
            '"glyph-orientation-vertical", "text-anchor", "writing-mode"\n'
          )
        );
      }

      /**
       * @param {string} libText
       */
      function patchCodeMirrorHtmlMixed(libText) {
        return (libText
          .replace(
            'allowMissingTagName: parserConfig.allowMissingTagName,\n',
            'allowMissingTagName: parserConfig.allowMissingTagName\n'
          )
        );
      }

      /** @param {string} filePath @param {string} content */
      function strictES3(filePath, content) {
        var jscriptKeywords =
          ('break,false,in,this,void,continue,for,new,true,while,delete,' +
            'function,null,typeof,with,else,if,return,var,' +
            'catch,class,case,const,debugger,finally,declare,do,instanceof,default,extends,export,enum,' +
            'is,import,interface,super,throw,try,switch').split(',');

        var ts = require('typescript');
        var ast = ts.createLanguageServiceSourceFile(
          filePath,
          ts.ScriptSnapshot.fromString(content),
          ts.ScriptTarget.ES3,
          '1',
          true,
          ts.ScriptKind.JS);

        var replacements = [];
        var replacementCount = 0;

        ts.forEachChild(ast, visitNode);

        if (replacements.length) {
          replacements.sort(function (r1, r2) { return r1.pos - r2.pos });
          var updatedContent = '';
          var lastPos = 0;
          for (var i = 0; i < replacements.length; i++) {
            var repl = replacements[i];
            if (repl.pos > lastPos) updatedContent += content.slice(lastPos, repl.pos);
            updatedContent += repl.text;
            lastPos = repl.pos + repl.length;
          }

          if (lastPos < content.length) {
            updatedContent += content.slice(lastPos);
            lastPos = content.length;
          }

          console.log(' handled ' + replacementCount + ' replacements');
          content = updatedContent;
        }

        return content;

        /** @param {import('typescript').Node} node */
        function visitNode(node) {
          switch (node.kind) {
            case ts.SyntaxKind.PropertyAccessExpression:
              var propAccess = /** @type {import('typescript').PropertyAccessExpression} */(node);
              if (propAccess.name.kind === ts.SyntaxKind.Identifier
                && jscriptKeywords.indexOf(propAccess.name.text) >= 0) {
                var kw = propAccess.name;
                var posDot = content.lastIndexOf('.', kw.pos);
                replacements.push({ pos: posDot, length: 1, text: '[' });
                replacements.push({ pos: kw.pos + kw.getLeadingTriviaWidth(), length: kw.text.length, text: '"' + kw.text + '"]' });
                replacementCount++;
              }
              break;

            case ts.SyntaxKind.PropertyAssignment:
              var propAssig = /** @type {import('typescript').PropertyAssignment} */(node);
              if (propAssig.name.kind === ts.SyntaxKind.Identifier
                && jscriptKeywords.indexOf(propAssig.name.text) >= 0) {
                var kw = propAssig.name;
                replacements.push({ pos: kw.pos + kw.getLeadingTriviaWidth(), length: kw.text.length, text: '"' + kw.text + '"' });
                replacementCount++;
              }
              break;

            case ts.SyntaxKind.ObjectLiteralExpression:
              var objLit = /** @type {import('typescript').ObjectLiteralExpression} */(node);
              if (objLit.properties.hasTrailingComma) {
                var ln = ast.getLineAndCharacterOfPosition(objLit.pos).line;
                if (ln > 740 && ln < 760 || true) {
                  var copy = {};
                  for (var k in objLit.properties) {
                    if (String(Number(k)) === k) continue;
                    copy[k] = objLit.properties[k];
                  }

                  var lastTok = objLit.getLastToken();
                  if (lastTok && content.slice(lastTok.pos - 1, lastTok.pos) === ',') {
                    replacements.push({
                      pos: lastTok.pos - 1,
                      length: 1,
                      text: ''
                    });

                    replacementCount++;
                  }
                }
              }
              break;

            case ts.SyntaxKind.GetAccessor:
            case ts.SyntaxKind.SetAccessor:
              var getSetAcc = /** @type {import('typescript').GetAccessorDeclaration} */(node);
              replacements.push({
                pos: getSetAcc.pos + getSetAcc.getLeadingTriviaWidth(),
                length: getSetAcc.name.pos - (getSetAcc.pos + getSetAcc.getLeadingTriviaWidth()),
                text: ''
              });
              replacements.push({
                pos: getSetAcc.name.end,
                length: 0,
                text: ': function'
              });
              break;
          }

          ts.forEachChild(node, visitNode);
        }

      }

      return detectLocalBuildValid().then(function (valid) {
        if (valid) return 'Local state is validated with hash: ' + catchREST_hash;

        return readLocalImports().then(
          function (imports) {
            return withImports(imports);
          },
          function (errorLocalImports) {
            return readUnpkgImports().then(
              function (imports) {
                return withImports(imports);
              },
              function (errUnpkgImports) {
                throw errorLocalImports;
              });
          });

        /**
         * @param {{ importLocalPath: string, fullPath?: string, content: string }[]} imports
         * @returns {Promise<string>}
         */
        function withImports(imports) {
          var comb = combineLib(imports);
          var combinedLib = comb.lib;
          var combinedTS = comb.ts;

          var builtHTML = getEmbeddedWholeHTML(true /* urlencoded */);

          var builtReadme = embeddedSplashReadmeMarkdownWithScript +
            '\n<' + '!--' + ' {build-by-hash:' + catchREST_hash + ' ' + new Date() + ' ' + process.platform + '/' + process.arch + '} ' + '--' + '>\n';

          var skipIndexHTML = skipUnlessUpdated(
            indexHTML_path,
            builtHTML
          );
          var skipIndex404HTML = skipUnlessUpdated(
            index404HTML_path,
            getEmbeddedWholeHTML(true /* urlencoded */)
          );
          var skipLib = skipUnlessUpdated(
            libJS_path,
            combinedLib
          );
          var skipTS = combinedTS && skipUnlessUpdated(
            libTS_path,
            combinedTS
          );
          var skipReadme = skipUnlessUpdated(
            readme_path,
            builtReadme
          );

          return Promise.all([skipIndexHTML, skipIndex404HTML, skipLib, skipTS, skipReadme]).then(
            function (skipped) {
              var skippedIndexHTML = skipped[0],
                skippedIndex404HTML = skipped[1],
                skippedLib = skipped[2],
                skippedTS = skipped[3] || skipped[3] === void 0,
                skippedReadme = skipped[4];

              if (skippedIndexHTML && skippedIndex404HTML && skippedLib && skippedTS && skippedReadme)
                return 'Build already matches files.';

              if (!skippedIndexHTML && !skippedIndex404HTML && !skippedLib && !skippedTS && !skippedReadme)
                return 'Build updated index.html, 404.html, lib.js, ts.js and README.md with hash ' + catchREST_hash;

              return 'Build only updated ' +
                (skippedIndexHTML ? '' : 'index.html ') +
                (skippedIndex404HTML ? '' : '404.html ') +
                (skippedLib ? '' : 'lib.js ') +
                (skippedTS ? '' : 'ts.js ' ) +
                (skippedReadme ? '' : 'README.md ') +
                'with hash ' + catchREST_hash;
            });

          /**
           * @param {string} filePath
           * @param {string | Buffer} content
           */
          function skipUnlessUpdated(filePath, content) {
            var alreadyMatchesPromise = readFileAsync(filePath).then(
              function (oldContent) {
                var markerRegexp = /\{build-by-hash:([^}]+)\}/g;
                if (oldContent.replace(markerRegexp, '') === String(content).replace(markerRegexp, '')) return true;
              },
              function () {// failed to read old file -- fine, just write then
              }
            );

            return alreadyMatchesPromise.then(
              // @ts-ignore
              function (alreadyMatches) {
                return alreadyMatches || writeFileAsync(filePath, content);
              });
          }
        }
      });
    }

    /**
     * @param {Promise<string>} buildPromise
     * @param {number} port
     */
    function startServer(port, buildPromise) {
      var mimeByExt = {
        html: 'text/html',
        htm: 'text/html',
        js: 'application/javascript',
        css: 'style/css'
      };

      return new Promise(function (resolve) { resolve(null); }).then(function () {
        /** @type {ReturnType<typeof listenToPort>} */
        var listeningServerPromise = listenToPort('', port)['catch'](function (error) {
          // TODO: if port is not available, send shutdown request and in the meantime start retrying...
          throw new Error();
        });

        return listeningServerPromise.then(
          function (listeningServer) {
            listeningServer.handle(handleRequest);
            return {
              listeningServer: listeningServer,
              message: 'server listening on http://localhost:' + listeningServer.port + '/'
            };

            /**
             * @param {RequestContext} ctx
             */
            function handleRequest(ctx) {
              return new Promise(function (resolve) { resolve(null);  }).then(function() {
                process.stdout.write(ctx.req.method + ' ' + ctx.url.pathname);

                ctx.res.setHeader('Access-Control-Allow-Credentials', 'true');
                ctx.res.setHeader('Access-Control-Allow-Headers', ctx.req.headers['access-control-request-headers'] || '*');
                ctx.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
                ctx.res.setHeader('Access-Control-Allow-Origin', ctx.req.headers.origin || '*');
                // ctx.res.setHeader('Access-Control-Max-Age', '3600');
                ctx.res.setHeader('Allow', 'POST, OPTIONS');
                ctx.res.setHeader('Server', 'catch-rest JSON');
                ctx.res.setHeader('Content-Type', 'text/html; charset=utf-8');
                // ctx.res.setHeader('Date', new Date().toISOString());

                if (ctx.req.method === 'OPTIONS') {
                  ctx.res.end();
                  return;
                } 

                if (ctx.req.method === 'POST' && ctx.url.pathname === '/xhr') {
                  return handleXhrRequest(ctx);
                }

                switch (ctx.path.toLowerCase()) {
                  case '/':
                  case '/index.html':
                    return handleIndexHTMLRequest(ctx);

                  case 'favicon.ico':
                    return handleFaviconRequest(ctx);

                  case '/control':
                    return handleControlRequest(ctx);

                  default:
                    return handleLocalFileRequest(ctx);
                }
              });
            }

            /** @param {RequestContext} ctx */
            function handleXhrRequest(ctx) {

              return receiveBody().then(
                /** @param {Buffer} bodyBuf */
                function (bodyBuf) {
                  var bodyJson = JSON.parse(bodyBuf.toString('utf8'));

                  if (typeof bodyJson.url !== 'string') throw new Error('URL expected.');
                  if (typeof bodyJson.method !== 'string') throw new Error('Method expected.');

                  return makeHttpRequestWithRedirects(bodyJson).then(wrapResponse);
                }
              )

              /** @param {{statusCode: number, statusMessage: string | undefined, headers: Record<string,string|string[]>, body: Buffer}} response */
              function wrapResponse(response) {
                try {
                  if (response.body && response.body.length) {
                    JSON.parse(response.body.toString('utf8'));
                    /** @type {boolean | undefined} */
                    var succeedParsingBody = true;
                  }
                } catch (_err) {}

                if (succeedParsingBody) {
                  var responseText = JSON.stringify({
                    statusCode: response.statusCode,
                    statusMessage: response.statusMessage,
                    headers: response.headers
                    // try to retain the exact shape of the response
                  }, null, 2).replace(/\s*}$/, ',\n  "json": ' + response.body.toString('utf8') + '\n}');
                } else {
                  var responseMsgJson = {
                    statusCode: response.statusCode,
                    statusMessage: response.statusMessage,
                    headers: response.headers
                  };
                  if (response.body && response.body.length)
                    responseMsgJson.text = response.body.toString('utf8');

                  var responseText = JSON.stringify(responseMsgJson, null, 2);
                }

                return responseText;
              }

              /**
               * @param {{ [x: string]: any; url: string; method: string; headers?: Record<string, string> | undefined; body?: string | undefined; }} options
               */
              function makeHttpRequestWithRedirects(options) {
                return makeHttpRequest(options).then(withResponse);
                /** @param {{statusCode: number, statusMessage: string | undefined, headers: Record<string,string|string[]>, body: Buffer}} response */
                function withResponse(response) {
                  if (response.statusCode > 300 && response.statusCode < 400) {
                    // redirect
                    var location = response.headers && response.headers.location || response.headers.Location;
                    if (typeof location === 'string') {
                      /** @type {typeof options} */
                      var updatedOptions = {};
                      for (var k in options) if (!(k in updatedOptions)) {
                        updatedOptions[k] = options[k];
                      }
                      updatedOptions.url = location;

                      return makeHttpRequest(updatedOptions).then(withResponse);
                    }
                  }

                  return response;
                }
              }

              /**
               * @param {{
               *  url: string;
               *  method: string;
               *  headers?: Record<string,string>
               *  body?: string;
               * }} options
               * @returns {Promise<{statusCode: number, statusMessage: string | undefined, headers: Record<string,string|string[]>, body: Buffer}>}
               */
              function makeHttpRequest(options) {
                var http = /^https/i.test(options.url) ? require('https') : require('http');

                return new Promise(function (resolve, reject) {
                  var request = http.request(
                    options.url,
                    {
                      method: options.method,
                      headers: options.headers
                    },
                    function (response) {
                      var responseDataBufs = [];
                      response.on('data', onResponseData);
                      response.on('end', onResponseEnd);
                      response.on('error', onResponseError);

                      /** @param {Buffer} data */
                      function onResponseData(data) {
                        responseDataBufs.push(data);
                      }

                      function onResponseEnd() {
                        var responseDataCombined = Buffer.concat(responseDataBufs);

                        resolve({
                          statusCode: /** @type {number} */(response.statusCode),
                          statusMessage: response.statusMessage,
                          headers: /** @type {Record<String, string | string[]>} */(response.headers),
                          body: responseDataCombined
                        });
                      }

                      /** @param {Error} error */
                      function onResponseError(error) {
                        reject(error);
                      }
                    }
                  );

                  if (options.body) request.write(options.body);
                  request.end();
                });
              }

              function receiveBody() {
                return new Promise(function (resolve, reject) {
                  /** @type {Buffer[]} */
                  var bufs = [];

                  ctx.req.on('data', onRequestData);
                  ctx.req.on('end', onRequestEnd);
                  ctx.req.on('error', onRequestError);

                  /** @param {Buffer} data */
                  function onRequestData(data) {
                    bufs.push(data);
                  }

                  function onRequestEnd() {
                    var combinedBufs = Buffer.concat(bufs);
                    resolve(combinedBufs);
                  }

                  /**
                   * @param {any} error
                   */
                  function onRequestError(error) {
                    reject(error);
                  }
                });
              }
            }

            /** @param {RequestContext} ctx */
            function handleIndexHTMLRequest(ctx) {
                return getEmbeddedWholeHTML(true /* urlencoded */);
            }

            /**
             * @param {RequestContext} ctx
             */
            function handleLocalFileRequest(ctx) {
              return new Promise(function (resolve) { resolve(null); }).then(function() {
                // TODO: inject ETag for caching

                var localPath = ctx.path.replace(/^\/+/, '').replace(/\/\.+/g, '/').replace(/\/\/+/g, '/');
                if (localPath === '/' || !localPath) localPath = 'index.html';

                var fullPath = path.resolve(__dirname, localPath);
                return readFileAsync(fullPath, 'buffer');
              });
            }

            /**
             * @param {RequestContext} ctx
             */
            function handleFaviconRequest(ctx) {
              return '-';
            }

            /**
             * @param {RequestContext} ctx
             */
            function handle404Request(ctx) {
              return {
                statusCode: 404,
                body: ctx.path + ' NOT FOUND.'
              };
            }

            /**
             * @param {RequestContext} ctx
             */
            function handleControlRequest(ctx) {
              if (ctx.url.query && ctx.url.query[catchREST_secret_variable_name] !== shared_process_secret)
                return handle404Request(ctx);

              switch (ctx.url.query && ctx.url.query.command) {
                case 'shutdown':
                  ctx.res.end('OK');
                  if (process.env[catchREST_secret_variable_name]) {
                    process.exit(0);
                  } else {
                    while (true) {
                      var svc = shutdownServices.pop();
                      if (!svc) break;
                      svc();
                    }
                  }
                  return;

                case 'restart':
                  ctx.res.end('starting new instance');
                  startNewInstance();
                  return;
              }
            }
          });
      });

      /** @typedef {{
       *  req: import('http').IncomingMessage;
       *  res: import('http').ServerResponse;
       *  server: import('http').Server;
       *  url: import('url').UrlWithParsedQuery;
       *  verb: { leadingSlash: string, verb: string, trailingSlash: string, index: number } | undefined;
       *  path: string;
       *  ext: string
       * }} RequestContext */

      /** @typedef {string | Buffer | { statusCode?: number, body: string | Buffer | null | undefined } | null | undefined} RequestHandlerResult */

      /**
       *
       * @param {string | null | undefined} host
       * @param {number} port
       * @returns {Promise<{ port: number, host: string, server: import('http').Server, handle(handler: (ctx: RequestContext) => Promise<RequestHandlerResult>): void }>}
       */
      function listenToPort(host, port) {
        return new Promise(function (resolve, reject) {

          /** @type {RequestContext[]} */
          var requestQueue = [];

          /** @type {(ctx: RequestContext) => Promise<RequestHandlerResult>} */
          var listener;
          var listenToPort = port;
          var listenToHost = host || '0.0.0.0';

          var server = http.createServer(function (req, res) {
            handleRequest(req, res);
          });

          shutdownServices.push(function () {
            server.close();
          });

          server.on('listening', function () {
            resolve({
              port: listenToPort,
              host: listenToHost,
              server: server,
              /** @param {(ctx: RequestContext) => Promise<RequestHandlerResult>} handler */
              handle: function (handler) {
                listener = handler;
                while (true) {
                  var next = requestQueue.shift();
                  if (!next) break;
                  handleWithListener(next);
                }
              }
            });
          });
          server.on('error', function (error) {
            reject(error);
          });
          server.listen(listenToPort, listenToHost);

          /** @param {HTTPRequest} req @param {HTTPResponse} res */
          function handleRequest(req, res) {
            var url = URL.parse(req.url || '', true /* parseQueryString */);
            var verb = getVerb(url.pathname);
            var pathBeforeVerb = verb ? (url.pathname || '').slice(0, verb.index - (verb.leadingSlash ? 1 : 0)) : url.pathname || '';
            var ext = path.extname(pathBeforeVerb);

            var entry = {
              req: req,
              res: res,
              server: server,
              url: url,
              verb: verb,
              path: pathBeforeVerb,
              ext: ext
            };
            if (/** @type {*}*/(listener)) handleWithListener(entry);
            else requestQueue.push(entry);
          }

          /** @param {RequestContext} entry */
          function handleWithListener(entry) {
            var res = listener(entry);
            if (res && typeof res.then === 'function') {
              res.then(
                function (result) {
                  if (!entry.res.headersSent) {
                    if (result && (typeof result === 'string' || /** @type {Buffer} */(result).length > 0 && typeof /** @type {Buffer} */(result)[0] === 'number')) {
                      var mime = mimeByExt[entry.ext.replace(/^\./, '')] || mimeByExt['html'];
                      if (/text|javascript|css/i.test(mime || '')) mime += '; charset=utf-8';
                      if (mime) entry.res.setHeader('Content-type', mime);
                      console.log(' [' + entry.path + ':' + /** @type {*} */(result).length + ']');
                      entry.res.end(result);
                      return;
                    }
                    else if (result && /** @type {{ body?: unknown }} */(result).body) {
                      if (typeof /** @type {*} */(result).statusCode === 'number') {
                        entry.res.statusCode = /** @type {*} */(result).statusCode;
                        entry.res.end(/** @type {*} */(result).body);
                        return;
                      }
                    }

                    return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(function () {
                      if (!entry.req.complete)
                        console.log('Request promise completed, but request not yet handled: ' + entry.req.method + ' ' + entry.req.url);
                    });
                  }
                },
                function (error) {
                  if (!entry.res.closed) {
                    if (!entry.res.headersSent) {
                      entry.res.statusCode = error.code === 'ENOENT' ? 404 : 500;
                      entry.res.statusMessage = error && error.message || String(error);
                      entry.res.setHeader('Content-type', 'text/plain');
                      console.log(' <' + entry.res.statusCode + ' ' + (error.code ? 'code:' + error.code : error.errorCode ? 'errorCode: ' + error.errorCode : error.message) + '>');
                    }

                    var errorResponse = error && error.stack ? error.stack :
                      error && error.message ? error.message :
                        String(error) || 'FAILED.'

                    entry.res.end(errorResponse);
                  }
                });
            }
          }
        });
      }
    }

    function watchSelf() {
      var changeDebounceTimeout;
      var watcher = createWatcher();

      shutdownServices.push(function () {
        watcher.close();
      });

      function checkAndTriggerRestart() {
        var currentContent = fs.readFileSync(__filename, 'utf8');
        if (currentContent.indexOf(catchREST + '') < 0) {
          // TODO: log stdio restart due to file change
          startNewInstance();
        }
      }

      function createWatcher() {
        var watcher = fs.watch(__filename, function () {
          clearTimeout(changeDebounceTimeout);
          changeDebounceTimeout = setTimeout(checkAndTriggerRestart, 200);
        });
        return watcher;
      }
    }

    function startNewInstance() {
      if (startNewInstance.current) {
        return startNewInstance.current;
      }

      return startNewInstance.current = new Promise(function (resolve, reject) {
        setTimeout(function () {
          startNewInstance.current = null;
        }, 1000);

        if (process.env[catchREST_secret_variable_name] && process.send) {
          process.send({ command: 'start' });
          return;
        }

        /** @type{Record<string,string>} */
        var env = {};
        env[catchREST_secret_variable_name] = shared_process_secret;
        var proc = child_process.fork(
          __filename,
          process.argv[1].toLowerCase().indexOf(
            __filename.replace(/\\/g, '/').split('/').reverse()[0].toLowerCase()) >= 0 ?
            process.argv.slice(2) :
            process.argv.slice(1),
          {
            env: env,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
          });

        if (proc.stdout) proc.stdout.on('data', handleChildStdout);
        if (proc.stderr) proc.stderr.on('data', handleChildStderr);
        proc.on('message', handleChildMessage);
        proc.on('error', handleError);
        proc.on('exit', handleExit);
        var counted = false;

        /**
         * @param {string | Uint8Array} data
         */
        function handleChildStdout(data) {
          resolve();
          if (!counted) {
            counted = true;
            runningChildProcesses.push(proc);
          }

          var procId = proc.pid;
          process.stdout.write(data);
        }

        /**
         * @param {string | Uint8Array} data
         */
        function handleChildStderr(data) {
          resolve();
          if (!counted) {
            counted = true;
            runningChildProcesses.push(proc);
          }

          var procId = proc.pid;
          process.stderr.write(data);
        }

        /**
         * @param {void | PromiseLike<void>} error
         */
        function handleError(error) {
          resolve(error);
          var procId = proc.pid;
        }

        /**
         * @param {{ command: string; }} msg
         */
        function handleChildMessage(msg) {
          if (msg && msg.command === 'start') {
            startNewInstance();
          }
        }

        /**
         * @param {void | PromiseLike<void>} exitCode
         */
        function handleExit(exitCode) {
          resolve(exitCode);

          var posCurrent = runningChildProcesses.indexOf(proc);
          if (posCurrent >= 0) runningChildProcesses.splice(posCurrent, 1);

          // TODO: debounce with timeout, shutdown if no longer runningChildProcesses
        }

      });
    }
    /** @type {null | Promise<void>} */
    startNewInstance.current = null;


    function launchBrowser() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve('Chrome browser launched (pretends).');
        }, 1000);
      });
    }

    /**
     * @param {number} port
     */
    function shutdownPredecessorIfNeeded(port) {
      if (process.env[catchREST_secret_variable_name]) {
        return requestShutdown(String(port)).then(function () {
          // response may come before server is down and HTTP port fully released
          return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(function () {
            return drinkChar + '~' + process.pid;
          });
        });
      } else {
        return new Promise(function (resolve) { resolve(drinkChar + '[' + process.pid + ']'); });
      }
    }

    /**
     * @param {string} port
     */
    function requestShutdown(port) {
      return new Promise(function (resolve, reject) {
        var http = require('http');
        var requestUrl = 'http://localhost:' + port + '/control?' + catchREST_secret_variable_name + '=' + shared_process_secret + '&command=shutdown';
        var httpReq = http.request(requestUrl, { method: 'POST' });
        var data = '';
        httpReq.on('data', function (chunk) {
          data += chunk;
        });
        httpReq.on('close', function () {
          resolve(data);
        });
        httpReq.on('error', function (error) {
          resolve(error);
        });
        httpReq.end();
      });
    }

    function bootNode() {
      var buildPromise = build();
      var port = derivePort(__dirname);
      var serverPromise = shutdownPredecessorIfNeeded(port).then(
        function (shutdownMessage) {
          process.stdout.write(shutdownMessage + '@' + port + ' ');
          return startServer(port, buildPromise);
        });

      return Promise.all([buildPromise, serverPromise]).then(
        function (promResults) {
          var buildResult = promResults[0];
          var serverResult = promResults[1];

          console.log(
            buildResult,
            serverResult.message
          );
          watchSelf();

          return launchBrowser().then(
            function (browserResult) {
              console.log(browserResult);
            },
            function (browserStartError) {
              console.error('Failed to launch browser: ', browserStartError);
            });
        },
        function (promErrors) {
          console.error('Failed to start ', promErrors);
        });
    }

    bootNode();
  }

  function runAsBrowser() {

    // #region COMMON BROWSER UTILS

    /**
     * @param {(Window & typeof globalThis) | HTMLElement} elem
     * @param {string} eventName
     * @param {(e: any) => void} callback
     */
    function on(elem, eventName, callback) {
      if (elem.addEventListener) return elem.addEventListener(eventName, callback);
      // @ts-ignore
      else if (elem.attachEvent) return elem.attachEvent('on' + eventName, callback);
      else elem['on' + eventName] = function (/** @type {Event | undefined} */ evt) {
        if (!evt) evt = typeof event === 'undefined' ? void 0 : event;
        return callback(/** @type {Event} */(evt));
      };
    }

    /**
     * @param {Window & typeof globalThis} elem
     * @param {string} eventName
     * @param {() => void} callback
     */
    function off(elem, eventName, callback) {
      if (elem.removeEventListener) return elem.removeEventListener(eventName, callback);
      // @ts-ignore
      else if (elem.detachEvent) return elem.detachEvent('on' + eventName, callback);
      else elem['on' + eventName] = null;
    }

    /**
     * @param {HTMLElement} elem
     * @param {string} value
     */
    function set(elem, value) {
      if (typeof value === 'string') {
        if (elem && 'textContent' in elem) {
          elem.textContent = value;
        } else if (elem && 'styleSheet' in elem && 'type' in elem) {
          // @ts-ignore
          if ('type' in elem && !elem.type) elem.type = 'text/css';
          // @ts-ignore
          elem.styleSheet.cssText = value;
        } else if (elem && 'innerText' in elem) {
          // @ts-ignore
          elem.innerText = value;
        } else {
          // @ts-ignore
          elem.text = value;
        }
      }
    }

    /**
     * @param {string} url
     * @param {RequestInit} opts
     */
    function fetchXHR(url, opts) {
      if (typeof XMLHttpRequest === 'function') {
        var xhr = new XMLHttpRequest();
      } else if (typeof ActiveXObject === 'function') {
        try {
          var xhr = /** @type {XMLHttpRequest} */(new ActiveXObject('MSXML2.XmlHttp'));
        } catch (_versionError) {
          var xhr = /** @type {XMLHttpRequest} */(new ActiveXObject('Microsoft.XMLHTTP'));
        }
      } else {
        return fetch(url, opts).then(function (response) {
          return response.text().then(function (text) {
            return {
              headers: response.headers,
              body: text
            };
          });
        });
      }

      return new Promise(function (resolve, reject) {
        var capturedError;
        var handleResultDebounceTimeout;

        try {
          xhr.open((opts.method || 'GET').toUpperCase(), url);
        } catch (error) {
          error.message += ' for ' + (opts.method || 'GET').toUpperCase() + ' at ' + url;
          throw error;
        }

        if (opts.withCredentials || opts.credentials === 'include') {
          try { xhr.withCredentials = true; } catch (_assignmentError) { }
        }

        try { xhr.onerror = handleOnerror; } catch (_assignmentError) { }
        xhr.onreadystatechange = handleOnreadystatechange;

        if (opts.headers) {
          for (var i = 0; i < opts.headers.entries.length; i++) {
            /** @type{[string, string]} */
            var entry = opts.headers.entries[i];
            try {
              xhr.setRequestHeader(entry[0], entry[1]);
            } catch (headerSetError) {
              if (typeof console !== 'undefined' && console && typeof console.log === 'function')
                console.log('Setting ', entry, headerSetError);
            }
          }
        }

        if (opts.body) {
          xhr.send(/** @type {*} */(opts.body));
        } else {
          xhr.send();
        }

        /**
         * @param {any} err
         */
        function handleOnerror(err) {
          capturedError = err;
          clearTimeout(handleResultDebounceTimeout);
          setTimeout(handleResult, 0);
        }

        function handleOnreadystatechange() {
          if (xhr.readyState !== 4) return;

          clearTimeout(handleResultDebounceTimeout);
          setTimeout(handleResult, 0);
        }

        function handleResult() {
          if (xhr.status === 200) {
            resolve({
              headers: {},
              body: typeof xhr.response === 'string' || xhr.response ? xhr.response : xhr.responseText
            });
          } else {
            if (capturedError) {
              if (!xhr.status && !capturedError.message)
                reject('No access HTTP/' + xhr.status + (xhr.statusText ? ' ' + xhr.statusText : ''));
              else
                reject(
                  (capturedError && capturedError.message ? capturedError.message :
                    capturedError ? String(capturedError) + ' ' :
                      '') + 'HTTP/' + xhr.status + ' ' + xhr.statusText);
            }
            else {
              reject('HTTP/' + xhr.status + ' ' + xhr.statusText);
            }
            // xhr.abort();
          }
        }
      });
    }

    /**
     * @template Func
     * @param {Func} func
     * @param {number} time
     * @param {number=} longest
     * @returns {Func}
     */
    function debounce(func, time, longest) {
      var timeout;
      var longestTimeout;
      var self;
      var args;
      return /** @type {Func} */(queue);
      function queue() {
        self = this;
        args = [];
        for (var i = 0; i < arguments.length; i++) { args.push(arguments[i]); }

        if (!longestTimeout && /** @type {number} */(longest) > 0) longestTimeout = setTimeout(invoke, longest);

        clearTimeout(timeout);
        timeout = setTimeout(invoke, time || 100);
      };

      function invoke() {
        clearTimeout(timeout);
        clearTimeout(longestTimeout);
        timeout = null;
        longestTimeout = null;
            /** @type {Function} */(func).apply(self, args);
      }
    }

    /**
     * @param {string} html
     * @param {HTMLElement=} toParent
     * @returns {Node[]}
     */
    function createElements(html, toParent) {
      var virt = document.createElement('div');
      virt.innerHTML = embeddedShellLayoutHTML;

      var elements = [];

      var lastAdded;
      for (var i = virt.childNodes.length - 1; i >= 0; i--) {
        var nod = virt.childNodes[i] || virt.childNodes.item(i);
        virt.removeChild(nod);
        if (toParent) {
          if (lastAdded) toParent.insertBefore(nod, lastAdded);
          else toParent.appendChild(nod);
          lastAdded = nod;
        }
        elements.push(nod);
      }

      return elements;
    }

    function getOrCreateDocumentBody() {
      var body = document.body;
      if (!body) {
        body = document.createElement('body');
        var docElement = document.documentElement;
        if (!docElement) {
          docElement =
            (document.head ? document.head.parentElement : null) ||
            document.getElementsByTagName('html')[0] ||
            (document.getElementsByTagName('head')[0] ? document.getElementsByTagName('head')[0].parentElement : null);
        }

        docElement.appendChild(body);
      }

      return body;
    }

    // #endregion COMMON BROWSER UTILS

    // #region PERSISTENCE

    /** @typedef {{
 *  domTimestamp?: number;
 *  domTotalSize?: number;
 *  domLoadedSize?: number;
 *  loadedFileCount?: number;
 *  storageName?: string;
 *  storageTimestamp?: number;
 *  storageLoadFailures?: { [storage: string]: string; };
 *  newDOMFiles?: string[];
 *  newStorageFiles?: string[];
 *  read(path: string): any;
 *  continueLoading();
 *  finishParsing(callback?: (drive: Drive.Detached.DOMDrive) => void);
 *  ondomnode?: (node: any, recognizedKind?: 'file' | 'totals', recognizedEntity?: any) => void;
 * }} BootState */

      // function formatTotalsInner(timestamp: number, totalSize: number): string;
      // function formatFileInner(path: string, content: any): string;
      // function formatSize(totalSize: number): string;
      // function formatDate(date: Date): string;

      // function parseTotalsInner(content: string): { timestamp: number; totalSize: number; };
      // function parseFileInner(content: string): { path: string; read(): string; };
      // function parseHTML(html: string): { files: { path: string; content: string; start: number; end: number; }[]; totals: {size?: number; timestamp?: number; start: number; end: number;}; };

    /** @typedef {{
     *  timestamp?: number;
     *  files(): string[];
     *  read(file: string): string;
     *  write(file: string, content: string | null);
     *  storedSize?(file: string): number | null;
     * }} Drive */

    /** @typedef {{
     *  timestamp?: number;
     *  write(file: string, content: string, encoding: string): void;
     *  forget(file: string): void;
     * }} Drive.Shadow */

    /** @typedef {{
     *  name: string;
     *  detect(uniqueKey: string, callback: (error?: string, detached?: Drive.Detached) => void): void;
     * }} Drive.Optional */

    /** @typedef {{
     *  timestamp: number | undefined;
     *  totalSize?: number;
     *  applyTo(mainDrive: Drive.Detached.DOMUpdater, callback: Drive.Detached.CallbackWithShadow): void;
     *  purge(callback: Drive.Detached.CallbackWithShadow): void;
     * }} Drive.Detached; */

    /** @typedef {{
     *  (loaded: Drive.Shadow): void;
     *  progress?: (current: number, total: number) => void;
     * }} Drive.Detached.CallbackWithShadow */

    /** @typedef {{
     *  timestamp?: number;
     *  write(file: string, content: string | null, encoding?: string): void;
     * }} Drive.Detached.DOMUpdater */

    /** @typedef {{
     *  write(file: string, content: string | null, encoding?: string): void;
     * } & Drive} Drive.Detached.DOMDrive */

    /** @typedef {{
     *  timestamp: number;
     *  totalSize: number;
     *  node: Comment;
     *  updateNode(): string | undefined;
     * }} DOMTotals */

    var persistence = (function () {

      /**
       * @param {Document} document
       * @param {string} uniqueKey
       * @param {Drive.Optional[]=} optionalDrives
       */
      function persistence(document, uniqueKey, optionalDrives) {
        // TODO: default document, uniqueKey, optionalDrives???
        if (!optionalDrives) optionalDrives = [attached.indexedDB, attached.webSQL, attached.localStorage];

        /** @type {BootState} */
        var bootState = {
          storageLoadFailures: {},
          newDOMFiles: [],
          newStorageFiles: [],

          read: read,
          continueLoading: continueLoading,
          finishParsing: finishParsing
        };

        /** @type {{ [path: string]: DOMFile; }} */
        var byPath = {};
        /** @type {DOMTotals | undefined} */
        var totals;
        /** @type {((drive: Drive) => void) | undefined} */
        var completionCallback;
        var anticipationSize = 0;
        /** @type {Node | undefined} */
        var lastNode;
        var currentOptionalDriveIndex = 0;
        var shadowFinished = false;
        /** @type {Drive.Detached | undefined} */
        var detachedDrive; // sometimes it lingers here until DOM timestamp is ready
        /** @type {Drive.Shadow | undefined} */
        var shadow;
        /** @type {{ [path: string]: any; } | undefined} */
        var toUpdateDOM;
        /** @type {string[]} */
        var toForgetShadow = [];
        var domFinished = false;

        var newDOMFileCache = {};
        var newStorageFileCache = {};

        loadNextOptionalDrive();

        /** @param {string} path @this {BootState} */
        function read(path) {
          if (toUpdateDOM && path in toUpdateDOM)
            return toUpdateDOM[path];
          var f = byPath[path];
          if (f) return f.read();
          else return null;
        }

        function continueLoading() {
          if (!domFinished)
            continueParsingDOM(false /* toCompletion */);

          bootState.newDOMFiles = [];
          for (var k in newDOMFileCache) {
            if (k && k.charCodeAt(0) == 47)
              bootState.newDOMFiles.push(k);
          }
          newDOMFileCache = {};

          bootState.newStorageFiles = [];
          for (var k in newStorageFileCache) {
            if (k && k.charCodeAt(0) == 47)
              bootState.newStorageFiles.push(k);
          }
          newStorageFileCache = {};
        }

        /**
         * @param {(drive: Drive.Detached.DOMDrive) => void} callback
         * @returns {void}
         */
        function finishParsing(callback) {
          if (domFinished) {
            try {
              // when debugging, break on any error will hit here too
              throw new Error('finishParsing should only be called once.');
            }
            catch (error) {
              if (typeof console !== 'undefined' && console && typeof console.error === 'function')
                console.error(error);
            }
          }

          if (typeof callback === 'function') {
            completionCallback = function (drive) {
              callback(drive);
            };
          }

          continueParsingDOM(true /* toCompletion */);
        }

        // THESE FUNCTIONS ARE NOT EXPOSED FROM BootState

        /** @param {Node} node */
        function processNode(node) {
          if (node.nodeType !== 8) return; // skip non-comment nodes

          var cmheader = new CommentHeader(/** @type {Comment}*/(node));

          var file = DOMFile.tryParse(cmheader);
          if (file) {
            processFileNode(file);
            if (typeof bootState.ondomnode === 'function') {
              bootState.ondomnode(node, 'file', file);
            }
            return;
          }

          var totals = tryParseDOMTotals(cmheader);
          if (totals) {
            processTotalsNode(totals);
            if (typeof bootState.ondomnode === 'function') {
              bootState.ondomnode(node, 'totals', totals);
            }
            return;
          }

          if (typeof bootState.ondomnode === 'function') {
            bootState.ondomnode(node);
          }
        }

        /** @param {DOMTotals} totals */
        function processTotalsNode(totals) {
          if (totals) {
            removeNode(totals.node);
          }
          else {
            totals = totals;
            bootState.domTimestamp = totals.timestamp;
            bootState.domTotalSize = Math.max(totals.totalSize, bootState.domTotalSize || 0);

            var detached = detachedDrive;
            if (detached) {
              detachedDrive = void 0;
              compareTimestampsAndProceed(detached);
            }
          }
        }

        /** @param {DOMFile} file */
        function processFileNode(file) {
          if (byPath[file.path]) { // a file with this name was encountered before
            // prefer earlier nodes
            removeNode(file.node);
            return;
          }

          // no updating nodes until whole DOM loaded
          // (looks like some browsers get confused by updating DOM during loading)

          byPath[file.path] = file;
          newDOMFileCache[file.path] = true;

          bootState.loadedFileCount = (bootState.loadedFileCount || 0) + 1;
          bootState.domLoadedSize = (bootState.domLoadedSize || 0) + file.contentLength;
          bootState.domTotalSize = Math.max(/** @type {number} */(bootState.domTotalSize), bootState.domLoadedSize);
        }

        /** @param {Node} node */
        function removeNode(node) {
          var parent = node.parentElement || node.parentNode;
          if (parent) parent.removeChild(node);
        }

        /** @param {boolean} toCompletion */
        function continueParsingDOM(toCompletion) {

          bootState.domLoadedSize = (bootState.domLoadedSize || 0) - anticipationSize;
          anticipationSize = 0;

          while (true) {

            // keep very last node unprocessed until whole document loaded
            // -- that means each iteration we find the next node, but process lastNode
            var nextNode = getNextNode();

            if (!nextNode && !toCompletion) {

              // no more nodes found, but more expected: no processing at this point
              // -- but try to estimate what part of the last known node is loaded (for better progress precision)
              if (lastNode && lastNode.nodeType === 8) {
                var cmheader = new CommentHeader(/** @type {Comment} */(lastNode));
                var speculativeFile = DOMFile.tryParse(cmheader);
                if (speculativeFile) {
                  anticipationSize = speculativeFile.contentLength;
                  bootState.domLoadedSize = bootState.domLoadedSize + anticipationSize;
                  bootState.domTotalSize = Math.max(/** @type {number} */(bootState.domTotalSize), bootState.domLoadedSize); // total should not become less that loaded
                }
              }
              return;
            }

            if (lastNode && lastNode.nodeType === 8) {
              processNode(lastNode);
            }
            else {
              if (typeof bootState.ondomnode === 'function') {
                bootState.ondomnode(lastNode);
              }
            }

            if (!nextNode) {
              // finish
              lastNode = void 0;
              processDOMFinished();
              return;
            }

            lastNode = nextNode;
          }
        }

        function processDOMFinished() {

          domFinished = true;

          if (toUpdateDOM) {

            // these are updates from attached storage that have not been written out
            // (because files with corresponding paths don't exist in DOM)

            for (var path in toUpdateDOM) {
              /** @type {{ content: any, encoding: any } | undefined} */
              var entry = void 0;
              if (!path || path.charCodeAt(0) !== 47) continue; // expect leading slash
              var content = toUpdateDOM[path];
              if (content && content.content && content.encoding) {
                entry = content; // content could be string or { content, encoding }
              }

              if (content === null) {
                var f = byPath[path];
                if (f) {
                  delete byPath[path];
                  removeNode(f.node);
                }
                else {
                  if (shadow) shadow.forget(path);
                  else toForgetShadow.push(path);
                }
              }
              else if (typeof content !== 'undefined') {
                var f = byPath[path];
                if (f) {
                  if (!entry)
                    entry = bestEncode(content); // it could already be { content, encoding }

                  var modified = f.write(entry.content, entry.encoding);
                  if (!modified) {
                    if (shadow) shadow.forget(path);
                    else toForgetShadow.push(path);
                  }
                }
                else {
                  var anchor = findAnchor();
                  var comment = document.createComment('');
                  var f = new DOMFile(comment, path, /** @type {*} */(null), 0, 0);
                  entry = bestEncode(content);
                  f.write(entry.content, entry.encoding);
                  byPath[path] = f;
                  newDOMFileCache[path] = true;

                  if (f.node.parentElement) {
                    f.node.parentElement.insertBefore(f.node, anchor);
                  } else {
                    document.body.appendChild(f.node);
                  }
                }
              }
            }
          }

          if (shadowFinished) {
            allCompleted();
            return;
          }

          var detached = detachedDrive;
          if (detached) {
            detachedDrive = void 0;
            compareTimestampsAndProceed(detached);
          }
        }

        function finishUpdateTotals() {
          if (totals) {
            if ((bootState.storageTimestamp || 0) > (bootState.domTimestamp || 0)) {
              totals.timestamp = /** @type {number} */(bootState.storageTimestamp);
              totals.updateNode();
            }
          }
        }

        function getNextNode() {
          if (!lastNode) {
            return getFirstElement();
          }

          var nextNode = lastNode.nextSibling;
          if (nextNode && (/** @type {HTMLElement} */(nextNode).tagName || '').toUpperCase() === 'HTML') {
            nextNode = getFirstElement(/* skipPreHTML */true);
          }

          if (!nextNode) {
            var body = document.body || null;
            var lastNodeParent = lastNode.parentNode || lastNode.parentElement || null;
            if (lastNodeParent !== body)
              nextNode = body.firstChild;
          }
          return nextNode;
        }

        /**
         * @param {boolean | undefined} [skipPreHTML]
         */
        function getFirstElement(skipPreHTML) {
          if (!skipPreHTML) {
            var doc = document.documentElement || document.getElementsByTagName('html')[0];
            if (doc && doc.previousSibling) {
              var climbFirstPreHTML = doc.previousSibling;
              while (climbFirstPreHTML.previousSibling) {
                climbFirstPreHTML = climbFirstPreHTML.previousSibling;
              }

              return climbFirstPreHTML;
            }
          }

          var head = document.head || /** @type {HTMLElement} */(document.getElementsByTagName('head')[0]);
          if (head) {
            var next = head.firstChild;
            if (next) return next;
          }
          var body = document.body;
          if (body)
            return body.firstChild;
          return null;
        }

        function loadNextOptionalDrive() {
          if (currentOptionalDriveIndex >= /** @type {Drive.Optional[]} */(optionalDrives).length) {

            finishOptionalDetection();
            return;
          }

          var nextDrive = /** @type {Drive.Optional[]} */(optionalDrives)[currentOptionalDriveIndex];
          nextDrive.detect(uniqueKey, function (error, detached) {
            if (detached) {
              bootState.storageName = nextDrive.name;
              shadowDetected(detached);
            }
            else {
              if (!bootState.storageLoadFailures) bootState.storageLoadFailures = {};
              bootState.storageLoadFailures[nextDrive.name] = error || 'Empty return.';
              currentOptionalDriveIndex++;
              loadNextOptionalDrive();
            }
          });
        }

        /** @param {Drive.Detached} detached */
        function shadowDetected(detached) {
          this.storageTimestamp = detached.timestamp;
          if (totals || domFinished)
            compareTimestampsAndProceed(detached);
          else
            detachedDrive = detached;
        }

        /** @param {Drive.Detached} detached */
        function compareTimestampsAndProceed(detached) {
          /** @type {boolean | undefined} */
          var domRecent;
          if ((detached.timestamp || 0) > (bootState.domTimestamp || 0)) domRecent = false;
          else if (!detached.timestamp && !bootState.domTimestamp) domRecent = false;
          else domRecent = true;

          if (domRecent) {
            detached.purge(function (shad) {
              shadow = shad;
              finishOptionalDetection();
            });
          }
          else {
            toUpdateDOM = {};
            detached.applyTo(
              {
                timestamp: bootState.domTimestamp,
                write: function (path, content, encoding) {
                  applyShadowToDOM(path, content, encoding);
                }
              },
              function (shad) {
                shadow = shad;
                finishOptionalDetection();
              });
          }
        }

        /** @param {string} path @param {any} content @param {string=} encoding */
        function applyShadowToDOM(path, content, encoding) {
          if (domFinished) {
            var file = byPath[path];
            if (file) {
              if (content === null) {
                removeNode(file.node);
                delete byPath[path];
              }
              else {
                var modified = file.write(content, encoding);
                if (!modified)
                  toForgetShadow.push(path);
              }
            }
            else {
              if (content === null) {
                toForgetShadow.push(path);
              }
              else {
                var anchor = findAnchor();
                var comment = document.createComment('');
                var f = new DOMFile(comment, path, /** @type {*}*/(null), 0, 0);
                f.write(content, encoding);
                document.body.insertBefore(f.node, anchor);
                byPath[path] = f;
                newDOMFileCache[path] = true;
              }
            }
            newStorageFileCache[path] = true;
          }
          else {
            if (!toUpdateDOM) toUpdateDOM = {};
            toUpdateDOM[path] = encoding ? { content: content, encoding: encoding } : content;
            newStorageFileCache[path] = true;
          }
        }

        function findAnchor() {
          /** @type {Node | undefined} */
          var anchor;
          for (var k in byPath) if (k && k.charCodeAt(0) === 47) {
            anchor = byPath[k].node;
          }
          if (!anchor) {
            var scripts = document.getElementsByTagName('script');
            anchor = scripts[scripts.length - 1];
          }
          return anchor;
        }

        function finishOptionalDetection() {
          if (shadow) {
            for (var i = 0; i < toForgetShadow.length; i++) {
              shadow.forget(toForgetShadow[i]);
            }
          }

          shadowFinished = true;

          if (domFinished) {
            allCompleted();
          }
        }

        function allCompleted() {
          finishUpdateTotals();

          /** @type {DOMFile[]} */
          var domFiles = [];
          for (var path in byPath) {
            if (!path || path.charCodeAt(0) !== 47) continue; // expect leading slash
            domFiles.push(byPath[path]);
          }

          if (!totals)
            // FIX: find actual size/timestamp?
            totals = forceInjectTotals(0, 0);

          var domDrive = createDOMDrive(/** @type {DOMTotals} */(totals), domFiles, document);
          var mountDrive = createMountedDrive(domDrive, shadow);

          if (typeof completionCallback === 'function') {
            // TODO: report lack of subscription?
            completionCallback(mountDrive);
          }
        }

        return bootState;
      }

      /**
       * @class
       * @param {Comment} node
       */
      function CommentHeader(node) {
        this.node = node;
        var headerLine;
        var content;
        if (typeof node.substringData === 'function'
          && typeof node.length === 'number') {
          var chunkSize = 128;

          if (node.length >= chunkSize) {
            // TODO: cut chunks off the start and look for newlines
            var headerChunks = [];
            while (headerChunks.length * chunkSize < node.length) {
              var nextChunk = node.substringData(headerChunks.length * chunkSize, chunkSize);
              var posEOL = nextChunk.search(/\r|\n/);
              if (posEOL < 0) {
                headerChunks.push(nextChunk);
                continue;
              }

              this.header = headerChunks.join('') + nextChunk.slice(0, posEOL);
              this.contentOffset = this.header.length + 1; // if header is separated by a single CR or LF

              if (posEOL === nextChunk.length - 1) { // we may have LF part of CRLF in the next chunk!
                if (nextChunk.charAt(nextChunk.length - 1) === '\r'
                  && node.substringData((headerChunks.length + 1) * chunkSize, 1) === '\n')
                  this.contentOffset++;
              }
              else if (nextChunk.slice(posEOL, posEOL + 2) === '\r\n') {
                this.contentOffset++;
              }

              this.contentLength = node.length - this.contentOffset;
              return;
            }

            this.header = headerChunks.join('');
            this.contentOffset = this.header.length;
            this.contentLength = node.length - this.header.length;
            return;
          }
        }

        /** @type {string} */
        var wholeCommentText = node.nodeValue || '';
        var posEOL = wholeCommentText.search(/\r|\n/);
        if (posEOL < 0) {
          this.header = wholeCommentText;
          this.contentOffset = wholeCommentText.length;
          this.contentLength = wholeCommentText.length - this.contentOffset;
          return;
        }

        this.contentOffset = wholeCommentText.slice(posEOL, posEOL + 2) === '\r\n' ?
          posEOL + 2 : // ends with CRLF
          posEOL + 1; // ends with singular CR or LF

        this.header = wholeCommentText.slice(0, posEOL);
        this.contentLength = wholeCommentText.length - this.contentOffset;
      }

      /**
       * @class
       * @param {Comment} node
       * @param {string} path
       * @param {(text: string) => any} encoding
       * @param {number} contentOffset
       * @param {number} contentLength
       */
      function DOMFile(node, path, encoding, contentOffset, contentLength) {
        this.node = node;
        this.path = path;
        this.contentLength = contentLength;

        this.read = read;
        this.write = write;

        /** @type {string | undefined} */
        var encodedPath;

        var domFile = this;

        function read() {

          // proper HTML5 has substringData to read only a chunk
          // (that saves on string memory allocations
          // comparing to fetching the whole text including the file name)
          var contentText = typeof domFile.node.substringData === 'function' ?
            domFile.node.substringData(contentOffset, 1000000000) :
            (domFile.node.nodeValue || '').slice(contentOffset);

          // XML end-comment is escaped when stored in DOM,
          // unescape it back
          var restoredText = contentText.
            replace(/\-\-\*(\**)\>/g, '--$1>').
            replace(/\<\*(\**)\!/g, '<$1!');

          // decode
          var decodedText = encoding ? encoding(restoredText) : restoredText;

          // update just in case it's been off
          this.contentLength = decodedText.length;

          return decodedText;
        };

        /**
         * @param {string | any[] | null} content
         * @param {any} encoding
         */
        function write(content, encoding) {

          content = !content ? '' : String(content);

          var encoded = encoding ? { content: content, encoding: encoding } : bestEncode(content);
          var protectedText = encoded.content.
            replace(/\-\-(\**)\>/g, '--*$1>').
            replace(/\<(\**)\!/g, '<*$1!');

          if (!encodedPath) {
            // most cases path is path,
            // but if anything is weird, it's going to be quoted
            // (actually encoded with JSON format)
            var encp = bestEncode(domFile.path, true /*escapePath*/);
            encodedPath = encp.content;
          }

          var leadText = ' ' + encodedPath + (encoded.encoding === 'LF' ? '' : ' [' + encoded.encoding + ']') + '\n';
          var html = leadText + protectedText;
          if (!domFile.node) return html; // can be used without backing 'node' for formatting purpose

          if (html === domFile.node.nodeValue) return false;
          domFile.node.nodeValue = html;

          encoding = encodings[encoded.encoding || 'LF'];
          contentOffset = leadText.length;

          contentLength = content.length;
          return true;
        }
      }

      /**
       * @param {CommentHeader} cmheader
       * @returns {DOMFile | undefined}
       */
      DOMFile.tryParse = function tryParse(cmheader) {

        //    /file/path/continue
        //    "/file/path/continue"
        //    /file/path/continue   [encoding]

        var parseFmt = /^\s*((\/|\"\/)(\s|\S)*[^\]])\s*(\[((\s|\S)*)\])?\s*$/;
        var parsed = parseFmt.exec(cmheader.header);
        if (!parsed) return; // does not match the format

        var filePath = parsed[1];
        var encodingName = parsed[5];

        if (filePath.charAt(0) === '"') {
          if (filePath.charAt(filePath.length - 1) !== '"') return; // unpaired leading quote
          try {
            if (typeof JSON !== 'undefined' && typeof JSON.parse === 'function')
              filePath = JSON.parse(filePath);
            else
              filePath = eval(filePath); // security doesn't seem to be compromised, input is coming from the same file
          }
          catch (parseError) {
            return; // quoted path but wrong format (JSON expected)
          }
        }
        else { // filePath NOT started with quote
          if (encodingName) {
            // regex above won't strip trailing whitespace from filePath if encoding is specified
            // (because whitespace matches 'non-bracket' class too)
            filePath = filePath.slice(0, filePath.search(/\S(\s*)$/) + 1);
          }
        }

        var encoding = encodings[encodingName || 'LF'];
        // invalid encoding considered a bogus comment, skipped
        if (encoding)
          return new DOMFile(cmheader.node, filePath, encoding, cmheader.contentOffset, cmheader.contentLength);

        return;
      }

      var monthsPrettyCase = ('Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec').split('|');
      var monthsUpperCaseStr = monthsPrettyCase.join('').toUpperCase();

      /**
       * @param {number} timestamp
       * @param {number} totalSize
       * @param {Comment} node
       */
      function domTotals(timestamp, totalSize, node) {
        var totals = {
          timestamp: timestamp,
          totalSize: totalSize,
          node: node,
          updateNode: updateNode
        };

        // cache after updating DOM, to avoid unneeded updates
        var domTimestamp = -1;
        var domTotalSize = -1;

        return totals;

        function updateNode() {

          if (domTimestamp === totals.timestamp && domTotalSize === totals.totalSize) return;

          // total 4Kb, saved 25 Apr 2015 22:52:01.231
          var newTotals =
            'total ' + formatSizeDOMTotals(totals.totalSize) + ', ' +
            'saved ' + formatDateDOMTotals(new Date(totals.timestamp));

          if (!totals.node) return newTotals;

          totals.node.nodeValue = newTotals;
          domTimestamp = totals.timestamp;
          domTotalSize = totals.totalSize;
        }
      }


      /**
       * @param {CommentHeader} cmheader
       * @returns {DOMTotals | undefined}
       */
        function tryParseDOMTotals(cmheader) {

          // TODO: preserve unknowns when parsing
          var parts = cmheader.header.split(',');
          var anythingParsed = false;
          var totalSize = 0;
          var timestamp = 0;

          for (var i = 0; i < parts.length; i++) {

            // total 234Kb
            // total 23
            // total 6Mb

            var totalFmt = /^\s*total\s+(\d*)\s*([KkMm])?b?\s*$/;
            var totalMatch = totalFmt.exec(parts[i]);
            if (totalMatch) {
              try {
                var total = parseInt(totalMatch[1]);
                if ((totalMatch[2] + '').toUpperCase() === 'K')
                  total *= 1024;
                else if ((totalMatch[2] + '').toUpperCase() === 'M')
                  total *= 1024 * 1024;
                totalSize = total;
                anythingParsed = true;
              }
              catch (totalParseError) { }
              continue;
            }

            var savedFmt = /^\s*saved\s+(\d+)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)(\s+(\d+)\:(\d+)(\:(\d+(\.(\d+))?))\s*(GMT\s*[\-\+]?\d+\:?\d*)?)?\s*$/i;
            var savedMatch = savedFmt.exec(parts[i]);
            if (savedMatch) {
              // 25 Apr 2015 22:52:01.231
              try {
                var savedDay = parseInt(savedMatch[1]);

                // first find string index within JANFEBMAR...NOVDEC then divide by three
                // which happens to be (0...11)*3
                var savedMonth = monthsUpperCaseStr.indexOf(savedMatch[2].toUpperCase());
                if (savedMonth >= 0 && savedMonth % 3 === 0)
                  savedMonth = savedMonth / 3;

                var savedYear = parseInt(savedMatch[3]);
                if (savedYear < 100)
                  savedYear += 2000; // no 19xx notation anymore :-(
                var savedHour = parseInt(savedMatch[5]);
                var savedMinute = parseInt(savedMatch[6]);
                var savedSecond = savedMatch[8] ? parseFloat(savedMatch[8]) : 0;

                if (savedMatch[4]) {
                  timestamp = new Date(savedYear, savedMonth, savedDay, savedHour, savedMinute, savedSecond | 0).valueOf();
                  timestamp += (savedSecond - (savedSecond | 0)) * 1000; // milliseconds

                  var savedGMTStr = savedMatch[11];
                  if (savedGMTStr) {
                    var gmtColonPos = savedGMTStr.indexOf(':');
                    if (gmtColonPos > 0) {
                      var gmtH = parseInt(savedGMTStr.slice(0, gmtColonPos));
                      timestamp += gmtH * 60 /*min*/ * 60 /*sec*/ * 1000 /*msec*/;
                      var gmtM = parseInt(savedGMTStr.slice(gmtColonPos + 1));
                      timestamp += gmtM * 60 /*sec*/ * 1000 /*msec*/;
                    }
                  }
                }
                else {
                  timestamp = new Date(savedYear, savedMonth, savedDay).valueOf();
                }

                anythingParsed = true;
              }
              catch (savedParseError) { }
            }

          }

          if (anythingParsed)
            return domTotals(timestamp, totalSize, cmheader.node);
        }


        /** @param {number} totalSize */
        function formatSizeDOMTotals(totalSize) {
          return (
            totalSize < 1024 * 9 ? totalSize + '' :
              totalSize < 1024 * 1024 * 9 ? ((totalSize / 1024) | 0) + 'Kb' :
                ((totalSize / (1024 * 1024)) | 0) + 'Mb');
        }

        /** @param {Date} date */
      function formatDateDOMTotals(date) {
        var dateLocalStr = date.toString(); // FIX: not very compatible option!
        var gmtMatch = (/(GMT\s*[\-\+]\d+(\:\d+)?)/i).exec(dateLocalStr);

        var d = date.getDate();
        var MMM = monthsPrettyCase[date.getMonth()];
        var yyyy = date.getFullYear();
        var h = date.getHours();
        var m = date.getMinutes();
        var s = date.getSeconds();
        var ticks = +date;

        var formatted =
          d +
          ' ' + MMM +
          ' ' + yyyy +
          (h > 9 ? ' ' : ' 0') + h +
          (m > 9 ? ':' : ':0') + m +
          (s > 9 ? ':' : ':0') + s +
          '.' + (ticks).toString().slice(-3) +
          (gmtMatch && gmtMatch[1] !== 'GMT+0000' ? ' ' + gmtMatch[1] : '');

        return formatted;
      }

      /** @param {number} timestamp @param {number} totalSize */
      function forceInjectTotals(timestamp, totalSize) {
        var comment = document.createComment('');
        var parent = document.head || document.getElementsByTagName('head')[0] || document.body;
        parent.insertBefore(comment, parent.children ? parent.children[0] : null);
        return domTotals(timestamp, totalSize, comment);
      }

      /**
       * @param {DOMTotals} totals
       * @param {DOMFile[]} fileList
       * @param {Document} document
       */
      function createDOMDrive(totals, fileList, document) {
        /** @type { { [path: string]: DOMFile; }} */
        var byPath = {};
        /** @type {Node | undefined} */
        var anchorNode;
        var totalSize = 0;

        /** @type {(typeof continueLoad) | undefined} */
        var _continueLoad = continueLoad;

        /** @type {Drive.Detached.DOMDrive} */
        var domDrive = {
          timestamp: void 0,

          files: files,
          read: read,
          write: write,
          storedSize: storedSize
        };

        for (var i = 0; i < fileList.length; i++) {
          byPath[fileList[i].path] = fileList[i];
          totalSize += fileList[i].contentLength;
          if (!anchorNode) anchorNode = fileList[i].node;
        }

        if (!totals) {
          totals = forceInjectTotals(domDrive.timestamp || 0, totalSize);
        }

        domDrive.timestamp = totals.timestamp;

        return domDrive;

        function files() {
          if (typeof Object.keys === 'function') {
            var result = Object.keys(byPath);
          }
          else {
            /** @type {string[]} */
            var result = [];
            for (var k in byPath) if (byPath.hasOwnProperty(k)) {
              result.push(k);
            }
          }

          result.sort();
          return result;
        }

        /** @param {string} file */
        function read(file) {
          var file = normalizePath(file);
          var f = byPath[file];
          if (!f) return null;
          else return f.read();
        }

        /** @param {string} file */
        function storedSize(file) {
          var normFile = normalizePath(file);
          var f = byPath[normFile];
          if (!f) return null;
          else return f.contentLength;
        }

        /** @param {string} file @param {string} content @param {string=} encoding */
        function write(file, content, encoding) {

          var totalDelta = 0;

          var file = normalizePath(file);
          var f = byPath[file];

          if (content === null) {
            // removal
            if (f) {
              totalDelta -= f.contentLength;
              var parentElem = f.node.parentElement || f.node.parentNode;
              if (parentElem) parentElem.removeChild(f.node);
              delete byPath[file];
            }
          }
          else {
            if (f) { // update
              var lengthBefore = f.contentLength;
              if (!f.write(content, encoding)) return; // no changes - no update for timestamp/totals
              totalDelta += f.contentLength - lengthBefore;
            }
            else { // addition
              var comment = document.createComment('');
              var f = new DOMFile(comment, file, /** @type {*} */(null), 0, 0);
              f.write(content, encoding);

              anchorNeeded();

              if (anchorNode) document.body.insertBefore(f.node, anchorNode);
              else document.body.appendChild(f.node);
              anchorNode = f.node; // next time insert before this node
              byPath[file] = f;
              totalDelta += f.contentLength;
            }
          }

          if (domDrive.timestamp)
            totals.timestamp = domDrive.timestamp;

          totals.totalSize += totalDelta;
          totals.updateNode();
        }

        function loadProgress() {
          return { total: totals ? totals.totalSize : totalSize, loaded: totalSize };
        }

        /** @param {DOMFile | DOMTotals} entry */
        function continueLoad(entry) {

          if (!entry) {
            _continueLoad = void 0;
            if (!totals) totals = forceInjectTotals(0, totalSize);
            totals.updateNode();
            return;
          }

          if (/** @type {DOMFile} */(entry).path) {
            var file = /** @type {DOMFile} */(entry);
            // in case of duplicates, prefer earlier, remove latter
            if (byPath[file.path]) {
              if (!file.node) return;
              var p = file.node.parentElement || file.node.parentNode;
              if (p) p.removeChild(file.node);
              return;
            }

            byPath[file.path] = file;
            if (!anchorNode) anchorNode = file.node;
            totalSize += file.contentLength;
          }
          else {
            totals = /** @type {DOMTotals} */(entry);
            // consider the values, but throw away the later totals DOM node
            totals.timestamp = Math.max(totals.timestamp, totals.timestamp | 0);
            totals.totalSize = Math.max(totals.totalSize, totals.totalSize | 0);
            if (!totals.node) return;
            var p = totals.node.parentElement || totals.node.parentNode;
            if (p) p.removeChild(totals.node);
          }
        }

        function anchorNeeded() {
          // try to insert at the start, so new files will be loaded first
          var anchor = anchorNode;
          if (anchor && anchor.parentElement === document.body) return;

          // this happens when filesystem is empty, or nodes got removed
          // - we try not to bubble above scripts, so boot UI is rendered fast even on slow connections
          var scripts = document.body.getElementsByTagName('script');
          anchor = scripts[scripts.length - 1];
          if (anchor) {
            var next = anchor.nextSibling;
            if (!next && anchor.parentNode)
              next = anchor.parentNode.nextSibling;
            anchor = next || void 0; // convert null to undefined
          }

          if (anchor) anchorNode = anchor;
        }
      }


      /**
       *
       * @param {Drive.Detached.DOMDrive} dom
       * @param {Drive.Shadow=} shadow
       * @returns {Drive}
       */
      function createMountedDrive(dom, shadow) {

        var drive = {
          updateTime: true,
          timestamp: dom.timestamp,

          files: files,
          read: read,
          write: write,
          storedSize: storedSize
        };

        /** @type {string[] | undefined} */
        var cachedFiles;

        return drive;

        function files() {
          if (!cachedFiles)
            cachedFiles = dom.files();

          return cachedFiles.slice(0);
        }

        /** @param {string} file */
        function read(file) {
          return dom.read(file);
        }

        /** @param {string} file */
        function storedSize(file) {
          if (dom.storedSize) return dom.storedSize(file);
          else return null;
        }

        /** @param {string} file @param {string} content */
        function write(file, content) {
          if (drive.updateTime)
            drive.timestamp = getTimeNow();

          cachedFiles = void 0;

          dom.timestamp = drive.timestamp;

          if (content || typeof content === 'string') {
            var encoded = bestEncode(content);
            dom.write(file, encoded.content, encoded.encoding);
            if (shadow) {
              shadow.timestamp = this.timestamp;
              shadow.write(file, encoded.content, encoded.encoding);
            }
          } else {
            dom.write(file, null);
            if (shadow) {
              shadow.timestamp = this.timestamp;
              shadow.forget(file);
            }
          }

        }
      }

      // #region ENCODING

      var encodings = (function () {
        /** @param {string} text */
        function CR(text) {
          return text.replace(/\r\n|\n/g, '\r');
        }

        /** @param {string} text */
        function CRLF(text) {
          return text.replace(/(\r\n)|\r|\n/g, '\r\n');
        }

        /** @param {string} text */
        function LF(text) {
          return text.replace(/\r\n|\r/g, '\n');
        }

        var _btoa = typeof btoa === 'function' ? btoa : __btoa;
        var _atob = typeof atob === 'function' ? atob : __atob;

        /**
         * @param {string} r
         * @returns {string}
         */
        function __btoa(r) {
          throw new Error('Polyfill for btoa is not implemented.');
        }

        /**
         * @param {string} r
         * @returns {string}
         */
        function __atob(r) {
          throw new Error('Polyfill for atob is not implemented.');
        }

        base64.btoa = _btoa;
        base64.atob = _atob;

      /** @param {string} text */
      function base64(text) {
        if (text && text.charCodeAt(0) === 42) {
          var bin = _atob(text.slice(1));
          var buf = typeof Uint8Array === 'function' ? new Uint8Array(bin.length) : [];
          for (var i = 0; i < bin.length; i++) {
            buf[i] = bin.charCodeAt(i);
          }
          return buf;
        }
        else {
          return _atob(text);
        }
      }

        /** @param {string} text */
        function json(text) {
          var result = typeof JSON === 'undefined' ? eval('(' + text + ')') : JSON.parse(text);

          if (result && typeof result !== 'string' && result.type) {
            /** @type {*} */
            var ctor = window[result.type];
            result = new ctor(result);
          }

          return result;
        }

        return {
          CR: CR, CRLF: CRLF, LF: LF,
          base64: base64,
          json: json
        };

      })();

      /** @param {string | number[]} content @param {boolean=} escapePath  */
      function bestEncode(content, escapePath) {

        if (content.length > 1024 * 2) {
          /*
          var compressed = encodings.lzma.compress(content);
          var str = '';
          for (var i = 0; i < compressed.length; i++) {
            str += String.fromCharCode((compressed[i] + 256) % 256);
          }
          var b64 = encodings.base64.btoa(str);
          if (typeof content !== 'string')
            b64 = '*' + b64;
          else
            b64 = 'A' + b64;
          if (b64.length<content.length)
            return {content:b64, encoding: 'lzma'};
            */
        }

        if (typeof content !== 'string') {
          if (typeof content === 'object' && typeof content.length === 'number'
            && content.length > 16 && typeof content[0] === 'number') {
            try {
              return { content: _encodeNumberArrayToBase64(content), encoding: 'base64' };
            }
            catch (base64Error) { }
          }
          return { content: _encodeArrayOrSimilarAsJSON(content), encoding: 'json' };
        }

        var maxEscape = ((content.length * 0.1) | 0) + 2;

        var escape = 0;
        var escapeHigh = 0;
        var prevChar = 0;
        var crCount = 0;
        var lfCount = 0;
        var crlfCount = 0;

        if (escapePath) {
          for (var i = 0; i < content.length; i++) {
            var c = content.charCodeAt(i);
            if (c < 32 || c > 126 || (c === 32 && (!i || i === content.length - 1))) {
              escape = 1;
              break;
            }
          }
        }
        else {
          for (var i = 0; i < content.length; i++) {
            var c = content.charCodeAt(i);

            if (c === 10) {
              if (prevChar === 13) {
                crCount--;
                crlfCount++;
              }
              else {
                lfCount++;
              }
            }
            else if (c === 13) {
              crCount++;
            }
            else if (c < 32 && c != 9) { // tab is an OK character, no need to escape
              escape++;
            }
            else if (c > 126) {
              escapeHigh++;
            }

            prevChar = c;

            if ((escape + escapeHigh) > maxEscape)
              break;
          }
        }

        if (escapePath) {
          if (escape)
            return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
          else
            return { content: content, encoding: 'LF' };
        }
        else {
          if (escape > maxEscape) {
            return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
          }

          else if (escape)
            return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
          else if (crCount) {
            if (lfCount)
              return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
            else
              return { content: content, encoding: 'CR' };
          }
          else if (crlfCount) {
            if (lfCount)
              return { content: _encodeUnusualStringAsJSON(content), encoding: 'json' };
            else
              return { content: content, encoding: 'CRLF' };
          }
          else {
            return { content: content, encoding: 'LF' };
          }
        }

      }

      /** @param {string} content */
      function _encodeUnusualStringAsJSON(content) {
        if (typeof JSON !== 'undefined' && typeof JSON.stringify === 'function') {
          var simpleJSON = JSON.stringify(content);
          var sanitizedJSON = simpleJSON.
            replace(/\u0000/g, '\\u0000').
            replace(/\r/g, '\\r').
            replace(/\n/g, '\\n');
          return sanitizedJSON;
        }
        else {
          var result = content.replace(
            /\"\u0000|\u0001|\u0002|\u0003|\u0004|\u0005|\u0006|\u0007|\u0008|\u0009|\u00010|\u00011|\u00012|\u00013|\u00014|\u00015|\u0016|\u0017|\u0018|\u0019|\u0020|\u0021|\u0022|\u0023|\u0024|\u0025|\u0026|\u0027|\u0028|\u0029|\u0030|\u0031/g,
            function (chr) {
              return (
                chr === '\t' ? '\\t' :
                  chr === '\r' ? '\\r' :
                    chr === '\n' ? '\\n' :
                      chr === '\"' ? '\\"' :
                        chr < '\u0010' ? '\\u000' + chr.charCodeAt(0).toString(16) :
                          '\\u00' + chr.charCodeAt(0).toString(16));
            });
          return result;
        }
      }

      /** @param {number[]} content */
      function _encodeNumberArrayToBase64(content) {
        var str = '';
        for (var i = 0; i < content.length; i++) {
          str += String.fromCharCode(content[i]);
        }
        var b64 = '*' + encodings.base64.btoa(str);
        return b64;
      }

      /**
       * @param {any[]} content
       */
      function _encodeArrayOrSimilarAsJSON(content) {
        var type = content instanceof Array ? null : /** @type {*} */(content).constructor && /** @type {*} */(content).constructor.name || /** @type {*} */(content).type;
        if (typeof JSON !== 'undefined' && typeof JSON.stringify === 'function') {
          if (type) {
            var wrapped = { type: type, content: content };
            var wrappedJSON = JSON.stringify(wrapped);
            return wrappedJSON;
          }
          else {
            var contentJSON = JSON.stringify(content);
            return contentJSON;
          }
        }
        else {
          var jsonArr = [];
          if (type) {
            jsonArr.push('{"type": "');
            jsonArr.push(type);
            jsonArr.push('", "content": [');
          }
          else {
            jsonArr.push('[');
          }

          for (var i = 0; i < content.length; i++) {
            if (i) jsonArr.push(',');
            jsonArr.push(content[i]);
          }

          if (type)
            jsonArr.push(']}');
          else
            jsonArr.push(']');

          return jsonArr.join('');
        }
      }

      // #endregion ENCODING

      // #region ATTACHED

      var attached = (function () {

        function _getLocalStorage() {
          return typeof localStorage === 'undefined' || typeof localStorage.length !== 'number' ? void 0 : localStorage;
        }

        return {
          localStorage: (function () {

            /**
             * @param {string} uniqueKey
             * @param {(error?: string, detached?: Drive.Detached) => void} callback
             */
            function detectLocalStorage(uniqueKey, callback) {
              try {
                var localStorageInstance = _getLocalStorage();
                if (!localStorageInstance) {
                  callback('Variable localStorage is not available.');
                  return;
                }

                var access = createLocalStorageAccess(localStorageInstance, uniqueKey);
                var dt = createLocalStorageDetached(access);
                callback(void 0, dt);
              }
              catch (error) {
                callback(error.message);
              }
            }

            /** @param {Storage} localStorage @param {string} prefix */
            function createLocalStorageAccess(localStorage, prefix) {
              /** @type {{ [key: string]: string; }} */
              var cache = {};

              /** @param {string} key */
              function get(key) {
                var k = expandKey(key);
                var r = localStorage.getItem(k);
                return r;
              }

              /** @param {string} key @param {string} value */
              function set(key, value) {
                var k = expandKey(key);
                try {
                  return localStorage.setItem(k, value);
                }
                catch (error) {
                  try {
                    localStorage.removeItem(k);
                    return localStorage.setItem(k, value);
                  }
                  catch (furtherError) {
                  }
                }
              }

              /** @param {string} key */
              function remove(key) {
                var k = expandKey(key);
                return localStorage.removeItem(k);
              }

              function keys() {
                /** @type {string[]} */
                var result = [];
                var len = localStorage.length;
                for (var i = 0; i < len; i++) {
                  var str = localStorage.key(i);
                  if (str && str.length > prefix.length && str.slice(0, prefix.length) === prefix)
                    result.push(str.slice(prefix.length));
                }
                return result;
              }

              /** @param {string} key */
              function expandKey(key) {
                var k;

                if (!key) {
                  k = prefix;
                }
                else {
                  k = cache[key];
                  if (!k)
                    cache[key] = k = prefix + key;
                }

                return k;
              }

              return {
                get: get,
                set: set,
                remove: remove,
                keys: keys
              }
            }

            /** @param {ReturnType<typeof createLocalStorageAccess>} access */
            function createLocalStorageDetached(access) {
              var detached = {
                timestamp: 0,
                applyTo: applyTo,
                purge: purge
              };

              var timestampStr = access.get('*timestamp');
              if (timestampStr && timestampStr.charAt(0) >= '0' && timestampStr.charAt(0) <= '9') {
                try {
                  detached.timestamp = parseInt(timestampStr);
                }
                catch (parseError) {
                }
              }

              return detached;

              /**
               * @param {Drive.Detached.DOMUpdater} mainDrive
               * @param {Drive.Detached.CallbackWithShadow} callback
               */
              function applyTo(mainDrive, callback) {
                var keys = access.keys();
                for (var i = 0; i < keys.length; i++) {
                  var k = keys[i];
                  if (k.charCodeAt(0) === 47 /* slash */) {
                    var value = access.get(k);
                    if (value && value.charCodeAt(0) === 91 /* open square bracket [ */) {
                      var cl = value.indexOf(']');
                      if (cl > 0 && cl < 10) {
                        var encoding = value.slice(1, cl);
                        var encFn = encodings[encoding];
                        if (typeof encFn === 'function') {
                          mainDrive.write(k, value.slice(cl + 1), encoding);
                          break;
                        }
                      }
                    }
                    mainDrive.write(k, value, 'LF');
                  }
                }

                var shadow = createLocalStorageShadow(access, mainDrive.timestamp);
                callback(shadow);
              }

              /** @param {Drive.Detached.CallbackWithShadow} callback */
              function purge(callback) {
                var keys = access.keys();
                for (var i = 0; i < keys.length; i++) {
                  var k = keys[i];
                  if (k.charAt(0) === '/') {
                    access.remove(k);
                  }
                }

                var shadow = createLocalStorageShadow(access, this.timestamp);
                callback(shadow);
              }
            }

            /**
             * @param {ReturnType<typeof createLocalStorageAccess>} access
             * @param {number | undefined} timestamp
             */
            function createLocalStorageShadow(access, timestamp) {
              var shadow = {
                timestamp: timestamp,
                write: write,
                forget: forget
              };

              return shadow;

              /**
               * @param {string} file
               * @param {string} content
               * @param {string} encoding
               */
              function write(file, content, encoding) {
                access.set(file, '[' + encoding + ']' + content);
                if (shadow.timestamp)
                  access.set('*timestamp', String(this.timestamp || 0));
              }

              /** @param {string} file */
              function forget(file) {
                access.remove(file);
              }
            }

            return {
              name: 'localStorage',
              detect: detectLocalStorage
            }
          })(), // LOCALSTORAGE

          webSQL: (function () {

            function getOpenDatabase() {
              return typeof openDatabase !== 'function' ? null : openDatabase;
            }

            /** @param {string} uniqueKey @param {(error?: string, detached?: Drive.Detached) => void} callback */
            function detectWebSQL(uniqueKey, callback) {
              try {
                detectWebSQLCore(uniqueKey, callback);
              }
              catch (error) {
                callback(error.message);
              }
            }

            /** @param {string} uniqueKey @param {(error?: string, detached?: Drive.Detached) => void} callback */
            function detectWebSQLCore(uniqueKey, callback) {

              var openDatabaseInstance = getOpenDatabase();
              if (!openDatabaseInstance) {
                callback('WebSQL API "openDatabase" is not available.');
                return;
              }

              var dbName = uniqueKey || 'portabled';

              var db = openDatabase(
                dbName, // name
                1, // version
                'Portabled virtual filesystem data', // displayName
                1024 * 1024); // size
              // upgradeCallback?


              var repeatingFailures_unexpected = 0; // protect against multiple transaction errors causing one another
              var finished = false; // protect against reporting results multiple times

              db.readTransaction(
                function (transaction) {

                  transaction.executeSql(
                    'SELECT value from "*metadata" WHERE name=\'editedUTC\'',
                    [],
                    function (transaction, result) {
                      /** @type {number | undefined} */
                      var editedValue;
                      if (result.rows && result.rows.length === 1) {
                        var editedValueStr = result.rows.item(0).value;
                        if (typeof editedValueStr === 'string') {
                          try {
                            editedValue = parseInt(editedValueStr);
                          }
                          catch (error) {
                            // unexpected value for the timestamp, continue as if no value found
                          }
                        }
                        else if (typeof editedValueStr === 'number') {
                          editedValue = editedValueStr;
                        }
                      }

                      finished = true;
                      callback(void 0, createWebSQLDetached(db, editedValue || 0, true));
                    },
                    function (transaction, sqlError) {
                      if (finished) return;
                      else finished = true;
                      // no data
                      callback(void 0, createWebSQLDetached(db, 0, false));
                    });
                },
                function (sqlError) {
                  if (finished) return;
                  else finished = true;

                  repeatingFailures_unexpected++;
                  if (repeatingFailures_unexpected > 5) {
                    callback('Loading from metadata table failed, generating multiple failures ' + sqlError.message);
                  }

                  tryAgain();

                  function tryAgain() {
                    db.transaction(
                      function (transaction) {
                        createMetadataTable(
                          transaction,
                          function (sqlError_creation) {
                            if (finished) return;
                            else finished = true;

                            if (sqlError_creation) {
                              repeatingFailures_unexpected++;
                              if (repeatingFailures_unexpected > 5) {
                                callback('Loading from metadata table failed: ' + sqlError.message + ' and creation metadata table failed: ' + sqlError_creation.message);
                                return;
                              }
                            }

                            // original metadata access failed, but create table succeeded
                            callback(void 0, createWebSQLDetached(db, 0, false));
                          })
                      }
                    )
                  }
                });

            }

            /**
             *
             * @param {SQLTransaction} transaction
             * @param {(error?: SQLError) => void} callback
             */
            function createMetadataTable(transaction, callback) {
              transaction.executeSql(
                'CREATE TABLE "*metadata" (name PRIMARY KEY, value)',
                [],
                function (transaction, result) {
                  return callback();
                },
                function (transaction, sqlError) {
                  return callback(sqlError);
                });
            }

            /**
             * @param {Database} db
             * @param {number} timestamp
             * @param {boolean} metadataTableIsValid
             */
            function createWebSQLDetached(db, timestamp, metadataTableIsValid) {
              /**
               * @param {Drive.Detached.DOMUpdater} mainDrive
               * @param {Drive.Detached.CallbackWithShadow} callback
               */
              function applyTo(mainDrive, callback) {
                db.readTransaction(
                  function (transaction) {
                    return listAllTables(
                      transaction,
                      function (tables) {
                        var ftab = getFilenamesFromTables(tables);
                        applyToWithFiles(transaction, ftab, mainDrive, callback);
                      },
                      function (sqlError) {
                        reportSQLError('Failed to list tables for the webSQL database.', sqlError);
                        callback(createWebSQLShadow(db, detached.timestamp, metadataTableIsValid));
                      });
                  },
                  function (sqlError) {
                    reportSQLError('Failed to open read transaction for the webSQL database.', sqlError);
                    callback(createWebSQLShadow(db, detached.timestamp, metadataTableIsValid));
                  });
              }

              /** @param {Drive.Detached.CallbackWithShadow} callback */
              function purge(callback) {
                db.transaction(
                  function (transaction) {
                    return listAllTables(
                      transaction,
                      function (tables) {
                        purgeWithTables(transaction, tables, callback);
                      },
                      function (sqlError) {
                        reportSQLError('Failed to list tables for the webSQL database.', sqlError);
                        callback(createWebSQLShadow(db, 0, false));
                      });
                  },
                  function (sqlError) {
                    reportSQLError('Failed to open read-write transaction for the webSQL database.', sqlError);
                    callback(createWebSQLShadow(db, 0, false));
                  });
              }

              /**
               * @param {SQLTransaction} transaction
               * @param {{ file: string, table: string }[]} ftab
               * @param {Drive.Detached.DOMUpdater} mainDrive
               * @param {Drive.Detached.CallbackWithShadow} callback
               */
              function applyToWithFiles(transaction, ftab, mainDrive, callback) {
                if (!ftab.length) {
                  callback(createWebSQLShadow(db, detached.timestamp, metadataTableIsValid));
                  return;
                }

                var reportedFileCount = 0;

                for (var i = 0; i < ftab.length; i++) {
                  applyFile(ftab[i].file, ftab[i].table);
                }

                function completeOne() {
                  reportedFileCount++;
                  if (reportedFileCount === ftab.length) {
                    callback(createWebSQLShadow(db, detached.timestamp, metadataTableIsValid));
                  }
                }

                /** @param {string} file @param {string} table */
                function applyFile(file, table) {
                  transaction.executeSql(
                    'SELECT * FROM "' + table + '"',
                    [],
                    function (transaction, result) {
                      if (result.rows.length) {
                        var row = result.rows.item(0);
                        if (row.value === null)
                          mainDrive.write(file, null);
                        else if (typeof row.value === 'string')
                          mainDrive.write(file, fromSqlText(row.value), fromSqlText(row.encoding));
                      }
                      completeOne();
                    },
                    function (sqlError) {
                      completeOne();
                    });
                }
              }

              /**
               * @param {SQLTransaction} transaction
               * @param {string[]} tables
               * @param {Drive.Detached.CallbackWithShadow} callback
               */
              function purgeWithTables(transaction, tables, callback) {
                if (!tables.length) {
                  callback(createWebSQLShadow(db, 0, false));
                  return;
                }

                var droppedCount = 0;

                for (var i = 0; i < tables.length; i++) {
                  transaction.executeSql(
                    'DROP TABLE "' + tables[i] + '"',
                    [],
                    function (transaction, result) {
                      completeOne();
                    },
                    function (transaction, sqlError) {
                      reportSQLError('Failed to drop table for the webSQL database.', sqlError);
                      completeOne();
                    });
                }

                function completeOne() {
                  droppedCount++;
                  if (droppedCount === tables.length) {
                    callback(createWebSQLShadow(db, 0, false));
                  }
                }
              }

              var detached = {
                timestamp: timestamp,
                applyTo: applyTo,
                purge: purge
              };

              return detached;
            }

            /**
             * @param {Database} db
             * @param {number} timestamp
             * @param {boolean} metadataTableIsValid
             */
            function createWebSQLShadow(db, timestamp, metadataTableIsValid) {

              /** @type {{ [name: string]: string; }} */
              var cachedUpdateStatementsByFile = {};

              /**
               * @param {string} file
               * @param {string} content
               * @param {string} encoding
               */
              function write(file, content, encoding) {
                if (content || typeof content === 'string') {
                  updateCore(file, content, encoding);
                }
                else {
                  deleteAllFromTable(file);
                }
              }

              /** @param {string} file */
              function forget(file) {
                dropFileTable(file);
              }

              /**
               * @param {string} file
               * @param {string} content
               * @param {string} encoding
               */
              function updateCore(file, content, encoding) {
                var updateSQL = cachedUpdateStatementsByFile[file];
                if (!updateSQL) {
                  var tableName = mangleDatabaseObjectName(file);
                  updateSQL = createUpdateStatement(file, tableName);
                }

                var repeatingTransactionErrorCount_unexpected = 0;
                db.transaction(
                  function (transaction) {
                    transaction.executeSql(
                      updateSQL,
                      ['content', content, encoding],
                      updateMetadata,
                      function (transaction, sqlError) {
                        createTableAndUpdate(transaction, file, tableName, updateSQL, content, encoding)
                      });
                  },
                  function (sqlError) {
                    repeatingTransactionErrorCount_unexpected++;
                    if (repeatingTransactionErrorCount_unexpected > 5) {
                      reportSQLError('Transaction failures (' + repeatingTransactionErrorCount_unexpected + ') updating file "' + file + '".', sqlError);
                      return;
                    }

                    // failure might have been due to table absence?
                    // -- redo with a new transaction
                    db.transaction(
                      function (transaction) {
                        createTableAndUpdate(transaction, file, tableName, updateSQL, content, encoding);
                      },
                      function (sqlError_inner) {
                        // failure might have been due to *metadata table ansence
                        // -- redo with a new transaction (last attempt)
                        db.transaction(
                          function (transaction) {
                            updateMetdata_noMetadataCase(transaction);
                            // OK, once again for extremely confused browsers like Opera
                            transaction.executeSql(
                              updateSQL,
                              ['content', content, encoding],
                              updateMetadata,
                              function (transaction, sqlError) {
                                createTableAndUpdate(transaction, file, tableName, updateSQL, content, encoding)
                              });
                          },
                          function (sqlError_ever_inner) {
                            reportSQLError(
                              'Transaction failure updating file "' + file + '" ' +
                              '(after ' +
                              (repeatingTransactionErrorCount_unexpected > 1 ? repeatingTransactionErrorCount_unexpected : '') +
                              ' errors like ' + sqlError_inner.message + ' and ' + sqlError_ever_inner.message +
                              ').',
                              sqlError);
                          });
                      });
                  });
              }

              /**
               * @param {SQLTransaction} transaction
               * @param {string} file
               * @param {string} tableName
               * @param {string} updateSQL
               * @param {string} content
               * @param {string} encoding
               */
              function createTableAndUpdate(transaction, file, tableName, updateSQL, content, encoding) {
                if (!tableName)
                  tableName = mangleDatabaseObjectName(file);

                transaction.executeSql(
                  'CREATE TABLE "' + tableName + '" (name PRIMARY KEY, value, encoding)',
                  [],
                  function (transaction, result) {
                    transaction.executeSql(
                      updateSQL,
                      ['content', content, encoding],
                      updateMetadata,
                      function (transaction, sqlError) {
                        reportSQLError('Failed to update table "' + tableName + '" for file "' + file + '" after creation.', sqlError);
                      });
                  },
                  function (transaction, sqlError) {
                    reportSQLError('Failed to create a table "' + tableName + '" for file "' + file + '".', sqlError);
                  });
              }

              /** @param {string} file */
              function deleteAllFromTable(file) {
                var tableName = mangleDatabaseObjectName(file);
                db.transaction(
                  function (transaction) {
                    transaction.executeSql(
                      'DELETE FROM TABLE "' + tableName + '"',
                      [],
                      updateMetadata,
                      function (transaction, sqlError) {
                        reportSQLError('Failed to delete all from table "' + tableName + '" for file "' + file + '".', sqlError);
                      });
                  },
                  function (sqlError) {
                    reportSQLError('Transaction failure deleting all from table "' + tableName + '" for file "' + file + '".', sqlError);
                  });
              }

              /** @param {string} file */
              function dropFileTable(file) {
                var tableName = mangleDatabaseObjectName(file);
                db.transaction(
                  function (transaction) {
                    transaction.executeSql(
                      'DROP TABLE "' + tableName + '"',
                      [],
                      updateMetadata,
                      function (transaction, sqlError) {
                        reportSQLError('Failed to drop table "' + tableName + '" for file "' + file + '".', sqlError);
                      });
                  },
                  function (sqlError) {
                    reportSQLError('Transaction failure dropping table "' + tableName + '" for file "' + file + '".', sqlError);
                  });
              }

              /** @param {SQLTransaction} transaction */
              function updateMetadata(transaction) {
                transaction.executeSql(
                  'INSERT OR REPLACE INTO "*metadata" VALUES (?,?)',
                  ['editedUTC', this.timestamp],
                  function () {
                    // OK
                  },
                  updateMetdata_noMetadataCase);
              }

              /** @param {SQLTransaction} transaction */
              function updateMetdata_noMetadataCase(transaction) {
                createMetadataTable(
                  transaction,
                  function (sqlerr) {
                    if (sqlerr) {
                      reportSQLError('Failed create metadata table.', sqlerr);
                      return;
                    }

                    transaction.executeSql(
                      'INSERT OR REPLACE INTO "*metadata" VALUES (?,?)',
                      ['editedUTC', this.timestamp],
                      function (tr, result) {
                        // OK
                      },
                      function (tr, sqlerr) {
                        reportSQLError('Failed to update metadata table after creation.', sqlerr);
                      });
                  });
              }

              /**
               * @param {string} file
               * @param {string} tableName
               */
              function createUpdateStatement(file, tableName) {
                return cachedUpdateStatementsByFile[file] =
                  'INSERT OR REPLACE INTO "' + tableName + '" VALUES (?,?,?)';
              }

              return {
                write: write,
                forget: forget
              };
            }

            /** @param {string} name */
            function mangleDatabaseObjectName(name) {
              // no need to polyfill btoa, if webSQL exists
              if (name.toLowerCase() === name)
                return name;
              else
                return '=' + btoa(name);
            }

            /** @param {string} name */
            function unmangleDatabaseObjectName(name) {
              if (!name || name.charAt(0) === '*') return null;

              if (name.charAt(0) !== '=') return name;

              try {
                return atob(name.slice(1));
              }
              catch (error) {
                return name;
              }
            }

            /**
             * @param {SQLTransaction} transaction
             * @param {(tables: string[]) => void} callback
             * @param {(sqlError: SQLError) => void} errorCallback
             */
            function listAllTables(transaction, callback, errorCallback) {
              transaction.executeSql(
                'SELECT tbl_name  from sqlite_master WHERE type=\'table\'',
                [],
                function (transaction, result) {
                  /** @type {string[]} */
                  var tables = [];
                  for (var i = 0; i < result.rows.length; i++) {
                    var row = result.rows.item(i);
                    var table = row.tbl_name;
                    if (!table || (table[0] !== '*' && table.charAt(0) !== '=' && table.charAt(0) !== '/')) continue;
                    tables.push(row.tbl_name);
                  }
                  callback(tables);
                },
                function (transaction, sqlError) { return errorCallback(sqlError); });
            }

            /** @param {string[]} tables */
            function getFilenamesFromTables(tables) {
              /** @type {{ table: string; file: string; }[]} */
              var filenames = [];
              for (var i = 0; i < tables.length; i++) {
                var file = unmangleDatabaseObjectName(tables[i]);
                if (file)
                  filenames.push({ table: tables[i], file: file });
              }
              return filenames;
            }

            /** @param {string} text */
            function toSqlText(text) {
              if (text.indexOf('\u00FF') < 0 && text.indexOf('\u0000') < 0) return text;

              return text.replace(/\u00FF/g, '\u00FFf').replace(/\u0000/g, '\u00FF0');
            }

            /** @param {string} sqlText */
            function fromSqlText(sqlText) {
              if (sqlText.indexOf('\u00FF') < 0 && sqlText.indexOf('\u0000') < 0) return sqlText;

              return sqlText.replace(/\u00FFf/g, '\u00FF').replace(/\u00FF0/g, '\u0000');
            }

            /**
             * @param {string} message
             * @param {SQLError} sqlError
             */
            function reportSQLError(message, sqlError) {
              if (typeof console !== 'undefined' && typeof console.error === 'function') {
                if (sqlError)
                  console.error(message, sqlError);
                else
                  console.error(sqlError);
              }
            }

            return {
              name: 'webSQL',
              detect: detectWebSQL
            };
          })(), // WEBSQL

          indexedDB: (function () {

            /**
             * @param {string} uniqueKey
             * @param {(error?: string, detached?: Drive.Detached) => void} callback
             */
            function detectIndexedDB(uniqueKey, callback) {
              try {
                // Firefox fires global window.onerror
                // when indexedDB.open is called in private mode
                // (even though it still reports failure in request.onerror and DOES NOT throw anything)
                var needsFirefoxPrivateModeOnerrorWorkaround =
                  typeof document !== 'undefined' && document.documentElement && document.documentElement.style
                  && 'MozAppearance' in document.documentElement.style;

                if (needsFirefoxPrivateModeOnerrorWorkaround) {
                  try {
                    detectIndexedDBCore(uniqueKey, function (error, detached) {
                      callback(error, detached);

                      // the global window.onerror will fire AFTER request.onerror,
                      // so here we temporarily install a dummy handler for it
                      var tmp_onerror = onerror;
                      onerror = function () { };
                      setTimeout(function () {
                        // restore on the next 'beat'
                        onerror = tmp_onerror;
                      }, 1);

                    });

                  }
                  catch (err) {
                    callback(err.message);
                  }
                }
                else {

                  detectIndexedDBCore(uniqueKey, callback);
                }

              }
              catch (error) {
                callback(error.message);
              }
            }

            function _getIndexedDB() {
              return typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function' ? null : indexedDB;
            }

            /**
             * @param {string} uniqueKey
             * @param {(error?: string, detached?: Drive.Detached) => void} callback
             */
            function detectIndexedDBCore(uniqueKey, callback) {

              var indexedDBInstance = _getIndexedDB();
              if (!indexedDBInstance) {
                callback('Variable indexedDB is not available.');
                return;
              }

              var dbName = uniqueKey || 'portabled';

              var openRequest = indexedDBInstance.open(dbName, 1);

              openRequest.onerror = function (errorEvent) { callback('Opening database error: ' + getErrorMessage(errorEvent)); };

              openRequest.onupgradeneeded = createDBAndTables;

              openRequest.onsuccess = function (event) {
                var db = openRequest.result;

                try {
                  var transaction = db.transaction(['files', 'metadata']);
                  // files mentioned here, but not really used to detect
                  // broken multi-store transaction implementation in Safari

                  transaction.onerror = function (errorEvent) { return callback('Transaction error: ' + getErrorMessage(errorEvent)); };

                  var metadataStore = transaction.objectStore('metadata');
                  var filesStore = transaction.objectStore('files');
                  var editedUTCRequest = metadataStore.get('editedUTC');
                }
                catch (getStoreError) {
                  callback('Cannot open database: ' + getStoreError.message);
                  return;
                }

                if (!editedUTCRequest) {
                  callback('Request for editedUTC was not created.');
                  return;
                }

                editedUTCRequest.onerror = function (errorEvent) {
                  var detached = createIndexedDBDetached(db, transaction, void 0);
                  callback(void 0, detached);
                };

                editedUTCRequest.onsuccess = function (event) {
                  /** @type {MetadataData} */
                  var result = editedUTCRequest.result;
                  var detached = createIndexedDBDetached(db, transaction, result && typeof result.value === 'number' ? result.value : void 0);
                  callback(void 0, detached);
                };
              }


              function createDBAndTables() {
                var db = openRequest.result;
                var filesStore = db.createObjectStore('files', { keyPath: 'path' });
                var metadataStore = db.createObjectStore('metadata', { keyPath: 'property' })
              }
            }

            /**
             * @param {string | Event} event
             */
            function getErrorMessage(event) {
              if (/** @type {*} */(event).message) return /** @type {*} */(event).message;
              else if (/** @type {*} */(event).target) return /** @type {*} */(event).target.errorCode;
              return event + '';
            }

            /** @typedef {{
             *  path: string;
             *  content: string;
             *  encoding: string;
             *  state: string | null;
             * }} FileData
             */

            /** @typedef {{
             *  property: string;
             *  value: any;
             * }} MetadataData */

            /**
             * @param {IDBDatabase} db
             * @param {IDBTransaction | undefined} transaction
             * @param {number | undefined} timestamp
             */
            function createIndexedDBDetached(db, transaction, timestamp) {

              // ensure the same transaction is used for applyTo/purge if possible
              // -- but not if it's completed
              if (transaction) {
                transaction.oncomplete = function () {
                  transaction = void 0;
                };
              }

              var detached = {
                timestamp: timestamp,
                applyTo: applyTo,
                purge: purge
              };

              return detached;

              /**
               * @param {Drive.Detached.DOMUpdater} mainDrive
               * @param {Drive.Detached.CallbackWithShadow} callback
               */
              function applyTo(mainDrive, callback) {
                var applyTransaction = transaction || db.transaction(['files', 'metadata']); // try to reuse the original opening _transaction
                var metadataStore = applyTransaction.objectStore('metadata');
                var filesStore = applyTransaction.objectStore('files');

                var onerror = function (/** @type {any} */ errorEvent) {
                  if (typeof console !== 'undefined' && console && typeof console.error === 'function')
                    console.error('Could not count files store: ', errorEvent);
                  callback(createIndexedDBShadow(db, detached.timestamp));
                };

                try {
                  var countRequest = filesStore.count();
                }
                catch (error) {
                  try {
                    applyTransaction = db.transaction(['files', 'metadata']); // try to reuse the original opening _transaction
                    metadataStore = applyTransaction.objectStore('metadata');
                    filesStore = applyTransaction.objectStore('files');
                    countRequest = filesStore.count();
                  }
                  catch (error) {
                    onerror(error);
                    return;
                  }
                }

                countRequest.onerror = onerror;

                countRequest.onsuccess = function (event) {
                  try {
                    var storeCount = countRequest.result;

                    var cursorRequest = filesStore.openCursor();
                    cursorRequest.onerror = function (errorEvent) {
                      if (typeof console !== 'undefined' && console && typeof console.error === 'function')
                        console.error('Could not open cursor: ', errorEvent);
                      callback(createIndexedDBShadow(db, detached.timestamp));
                    };

                    var processedCount = 0;

                    cursorRequest.onsuccess = function (event) {

                      try {
                        var cursor = cursorRequest.result;

                        if (!cursor) {
                          callback(createIndexedDBShadow(db, detached.timestamp));
                          return;
                        }

                        if (callback.progress)
                          callback.progress(processedCount, storeCount);
                        processedCount++;

                        /** @type {FileData} */
                        var result = cursor.value;
                        if (result && result.path) {
                          mainDrive.timestamp = timestamp;
                          mainDrive.write(result.path, result.content, result.encoding);
                        }

                        cursor['continue']();

                      }
                      catch (cursorContinueSuccessHandlingError) {
                        var message = 'Failing to process cursor continue';
                        try {
                          message += ' (' + processedCount + ' of ' + storeCount + '): ';
                        }
                        catch (ignoreDiagError) {
                          message += ': ';
                        }

                        if (typeof console !== 'undefined' && console && typeof console.error === 'function')
                          console.error(message, cursorContinueSuccessHandlingError);
                        callback(createIndexedDBShadow(db, timestamp));
                      }

                    }; // cursorRequest.onsuccess

                  }
                  catch (cursorCountSuccessHandlingError) {

                    var message = 'Failing to process cursor count';
                    try {
                      message += ' (' + countRequest.result + '): ';
                    }
                    catch (ignoreDiagError) {
                      message += ': ';
                    }

                    if (typeof console !== 'undefined' && console && typeof console.error === 'function')
                      console.error(message, cursorCountSuccessHandlingError);
                    callback(createIndexedDBShadow(db, detached.timestamp));
                  }

                }; // countRequest.onsuccess

              }

              /** @param {Drive.Detached.CallbackWithShadow} callback */
              function purge(callback) {
                if (transaction) {
                  transaction = void 0;
                  setTimeout(function () { // avoid being in the original transaction
                    purgeCore(callback);
                  }, 1);
                }
                else {
                  purgeCore(callback);
                }
              }

              /** @param {Drive.Detached.CallbackWithShadow} callback */
              function purgeCore(callback) {
                var purgeTransaction = db.transaction(['files', 'metadata'], 'readwrite');

                var filesStore = purgeTransaction.objectStore('files');
                filesStore.clear();

                var metadataStore = purgeTransaction.objectStore('metadata');
                metadataStore.clear();

                callback(createIndexedDBShadow(db, -1));
              }

            }

            /**
             * @param {IDBDatabase} db
             * @param {number | undefined} timestamp
             */
            function createIndexedDBShadow(db, timestamp) {
              var lastWrite = 0;
              var conflatedWrites;

              var shadow = {
                timestamp: timestamp,
                write: write,
                forget: forget
              };

              return shadow;

              /**
               * @param {string} file
               * @param {string | null} content
               * @param {string} encoding
               */
              function write(file, content, encoding) {
                var now = getTimeNow();
                if (conflatedWrites || now - lastWrite < 10) {
                  if (!conflatedWrites) {
                    conflatedWrites = {};
                    setTimeout(function () {
                      var writes = conflatedWrites;
                      conflatedWrites = null;
                      writeCore(writes);
                    }, 0);
                  }
                  conflatedWrites[file] = { content: content, encoding: encoding };
                }
                else {
                  var entry = {};
                  entry[file] = { content: content, encoding: encoding };
                  writeCore(entry);
                }
              }

              /**
               * @param {{ [x: string]: any; hasOwnProperty?: any; }} writes
               */
              function writeCore(writes) {
                lastWrite = getTimeNow();
                var writeTransaction = db.transaction(['files', 'metadata'], 'readwrite');
                var filesStore = writeTransaction.objectStore('files');
                var metadataStore = writeTransaction.objectStore('metadata');

                for (var file in writes) if (writes.hasOwnProperty(file)) {

                  var entry = writes[file];

                  // no file deletion here: we need to keep account of deletions too!
                  /** @type {FileData} */
                  var fileData = {
                    path: file,
                    content: entry.content,
                    encoding: entry.encoding,
                    state: null
                  };

                  var putFile = filesStore.put(fileData);
                }

                /** @type {MetadataData} */
                var md = {
                  property: 'editedUTC',
                  value: Date.now()
                };

                metadataStore.put(md);
              }

              /** @param {string} file */
              function forget(file) {
                var forgetTransaction = db.transaction(['files'], 'readwrite');
                var filesStore = forgetTransaction.objectStore('files');
                filesStore['delete'](file);
              }

            }

            return {
              name: 'indexedDB',
              detect: detectIndexedDB
            }
          })()
        };
      })();

      // #endregion ATTACHED

      /** @param {string} path */
      function normalizePath(path) {
        if (!path) return '/'; // empty paths converted to root

        if (path.charAt(0) !== '/') // ensuring leading slash
          path = '/' + path;

        path = path.replace(/\/\/*/g, '/'); // replacing duplicate slashes with single
        return path;
      }

      return persistence;

    })();

    // #endregion PERSISTENCE


    /**  @typedef {{
     * update: (opts: { text: string, selectionStart: number, selectionEnd: number }) => void;
     *
     * text: string | undefined;
     * selectionStart: number;
     * selectionEnd: number;
     *
     * onchange: (() => void) | undefined;
     * onselectionchange: (() => void) | undefined;
     * }} RichEditorController */

    /**
     * @param {HTMLElement} host
     * @param {*} commands
     */
    function flippingRichEditor(host, commands) {

      function textareaEditor(host, commands) {
        var textareaElem = document.createElement('textarea');
        textareaElem.className = 'editor';
        // all that stuff here...
        host.appendChild(textareaElem);

        /** @type {RichEditorController} */
        var controller = {
          update,
          text: '',
          selectionStart: 0,
          selectionEnd: 0,
          onchange: void 0,
          onselectionchange: void 0
        };

        textareaElem.onchange = handleChangeEvent;
        textareaElem.onkeydown = handleChangeEvent;
        textareaElem.onkeyup = handleChangeEvent;
        textareaElem.onmousedown = handleChangeEvent;
        textareaElem.onmouseup = handleChangeEvent;
        textareaElem.onpaste = handleChangeEvent;
        textareaElem.onblur = handleChangeEvent;
        textareaElem.onfocus = handleChangeEvent;
        textareaElem.oninput = handleChangeEvent;
        textareaElem.onselect = handleChangeEvent;
        textareaElem.onselectionchange = handleChangeEvent;
        textareaElem.onreset = handleChangeEvent;
        textareaElem.onkeydown = handleKeydownEvent;

        return controller;

        /** @param {{ text: string, selectionStart: number, selectionEnd: number }} opts */
        function update(opts) {
          var selectionTextChanged = typeof opts.text === 'string' && textareaElem.value !== opts.text; 
          var selectionStartChanged = typeof opts.selectionStart === 'number' && opts.selectionStart >= 0 && opts.selectionStart <= textareaElem.value.length;
          var selectionEndChanged = typeof opts.selectionEnd === 'number' && opts.selectionEnd >= 0 && opts.selectionEnd <= textareaElem.value.length;

          if (selectionTextChanged) textareaElem.value = opts.text;

          if (selectionStartChanged || selectionEndChanged) {
            var newSelectionStart = selectionStartChanged ? opts.selectionStart : textareaElem.selectionStart;
            var newSelectionEnd = selectionEndChanged ? opts.selectionEnd : textareaElem.selectionEnd;
            if (newSelectionStart > newSelectionEnd) {
              var tmp = newSelectionStart;
              newSelectionStart = newSelectionEnd;
              newSelectionEnd = tmp;
            }

            if (typeof textareaElem.setSelectionRange === 'function') {
              textareaElem.setSelectionRange(newSelectionStart, newSelectionEnd);
            } else {
              textareaElem.selectionStart = newSelectionStart;
              textareaElem.selectionEnd = newSelectionEnd;
            }
          }

          if (selectionTextChanged || selectionStartChanged || selectionEndChanged) {
            stopPendingChangeEvents();
            var change = selectionTextChanged ? 'change' : 'selectionchange';
            fireChangeEvent(change);
          }
        }

        /** @typedef {'change' | 'selectionchange'} SelectionChangeType */

        /**
         * @returns {SelectionChangeType | undefined}
         */
        function validateController(controllerInstance) {
          if (!controllerInstance) controllerInstance = controller;
          var currentText = (textareaElem.value || '');
          var currentSelectionStart = textareaElem.selectionStart;
          var currentSelectionEnd = textareaElem.selectionEnd;

          var hasChange = currentText !== (controller.text == null ? '' : String(controller.text));
          var hasSelectionChange = currentSelectionStart !== controller.selectionStart || currentSelectionEnd !== controller.selectionEnd;

          var changeType = hasChange ? 'change' : hasSelectionChange ? 'selectionchange' : void 0;
          if (controller.text !== currentText) controller.text = currentText;
          if (controller.selectionStart !== currentSelectionStart) controller.selectionStart = currentSelectionStart;
          if (controller.selectionEnd !== currentSelectionEnd) controller.selectionEnd = currentSelectionEnd;

          return changeType;
        }

        /** @param {SelectionChangeType | undefined} selectionChangeType */
        function fireChangeEvent(selectionChangeType) {
          if (selectionChangeType === 'change' && typeof controller.onchange === 'function') controller.onchange();
          if (selectionChangeType === 'selectionchange' && typeof controller.onselectionchange === 'function') controller.onselectionchange();
        }

        var changeEventTimeoutDebounce;
        var changeEventTimeoutMax;

        function handleChangeEvent() {
          clearTimeout(changeEventTimeoutDebounce);
          changeEventTimeoutDebounce = setTimeout(handleChangeEventNow, 200);
          if (!changeEventTimeoutMax) changeEventTimeoutMax = setTimeout(handleChangeEventNow, 600);
        }

        /** @param {KeyboardEvent} evt */
        function getKey(evt) {
          return CodeMirror.keyName(evt);
        }

        /** @param {KeyboardEvent} evt */
        function handleKeydownEvent(evt) {
          if (!commands) return;
          var key = getKey(evt);
          var match = commands[key] || commands[key.replace(/\-/g, '')];
          if (typeof match === 'function') {
            return match(evt);
          }
        }

        function stopPendingChangeEvents() {
          clearTimeout(changeEventTimeoutDebounce); changeEventTimeoutDebounce = null;
          clearTimeout(changeEventTimeoutMax); changeEventTimeoutMax = null;
        }

        function handleChangeEventNow() {
          stopPendingChangeEvents();

          var change = validateController();
          fireChangeEvent(change);
        }
      }

      function codemirrorEditor(host, commands) {

        /** @type {import('codemirror').EditorConfiguration} */
        var cmOptions = {
          // @ts-ignore
          lineNumbers: true,
          extraKeys: commands,
          // @ts-ignore
          foldGutter: true,
          gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
          lineWrapping: true,
          autofocus: true
        };

        var editor = CodeMirror(
          host,
          cmOptions
        );

        /** @type {RichEditorController} */
        var controller = {
          update,
          text: '',
          selectionStart: 0,
          selectionEnd: 0,
          onchange: void 0,
          onselectionchange: void 0,
          onkeydown: void 0
        };
      }
    }



    // #region CODEMIRROR PARSING MODE
    /** @typedef {{
     *  firstLine?: ReturnType<typeof parseFirstLine> | 'skip' | 'header' | 'body'
     * }} RestRequestModeState */
    /** @type {import('codemirror').ModeFactory<RestRequestModeState>} */
    function restRequestMode(config, modeOptions) {
      return {
        name: 'rest-request',
        token: processToken,
        startState: defineStartState
      };

      function defineStartState() {
        return {};
      }

      /**
       * @param {import('codemirror').StringStream} stream
       * @param {RestRequestModeState} state
       */
      function processToken(stream, state) {
        var startPos = stream.pos;
        var res = processTokenCore(stream, state);
        // if (typeof console !== 'undefined' && console && typeof console.log === 'function')
        //   console.log(
        //     'token: ' +
        //     (startPos > 0 ? '_' + stream.string.slice(0, startPos) + '_' : '_') +
        //     res + ':"' + stream.string.slice(startPos, stream.pos) + '"' +
        //     (stream.pos < stream.string.length ? '_' + stream.string.slice(stream.pos) + '_' : '_')
        //   );

        return res;
      }

      /**
       * @param {import('codemirror').StringStream} stream
       * @param {RestRequestModeState} state
       */
      function processTokenCore(stream, state) {
        if (!state.firstLine)
          state.firstLine = parseFirstLine(stream.string) || 'skip';

        if (state.firstLine === 'skip') {
          while (stream.next() && stream.column()) { /* skip until end of line/text */ };
          return 'text';
        }

        if (state.firstLine === 'header') {
          if (/^\s/.test(stream.string)) {
            while (stream.next() && stream.column()) { /* skip until end of line/text */ };
            return 'req-header';
          }
          state.firstLine = 'body';
        }

        if (state.firstLine === 'body') {
          // this is body/headers
          var nextPeek = stream.string;
          stream.skipToEnd();
          return 'text';
        }

        if (state.firstLine.verbPos >= 0) {
          if (stream.pos < state.firstLine.verbPos) {
            while (stream.pos < state.firstLine.verbPos) stream.next();
            return 'whitespace';
          }
          else if (stream.pos < state.firstLine.verbPos + state.firstLine.verb.length) {
            while (stream.pos < state.firstLine.verbPos + state.firstLine.verb.length) stream.next();
            if (state.firstLine.urlPos < 0) state.firstLine = 'header';
            return 'req-verb';
          }
        }

        if (state.firstLine.url) {
          if (stream.pos < state.firstLine.urlPos) {
            while (stream.pos < state.firstLine.urlPos) stream.next();
            return 'whitespace';
          }
          else if (stream.pos < state.firstLine.urlPos + state.firstLine.url.length) {
            while (stream.pos < state.firstLine.urlPos + state.firstLine.url.length) stream.next();
            state.firstLine = 'header';
            return 'req-url';
          }
          state.firstLine = 'header';
          stream.next();
          return 'whitespace';
        }

        state.firstLine = 'body';
        stream.next();
        return 'body';
      }
    }
    // #endregion

    // #region CODEMIRROR RESPONSE JSON MODE
    /** @typedef {{
     *  fileText: string;
     *  parsedJson: ReturnType<typeof parseJsonLike> | undefined;
     *  line: number;
     * }} JSONReplyModeState */
    /** @type {import('codemirror').ModeFactory<JSONReplyModeState>} */
    function jsonReplyMode(config, modeOptions) {

      /** @type {ReturnType<typeof createTypeScriptLanguageService> | undefined} */
      var lang;

      return {
        name: 'rest-request',
        token: processToken,
        blankLine: processBlankLine,
        startState: defineStartState
      };

      function defineStartState() {
        var configWithValue = /** @type {{ getCM?: () => import('codemirror').Editor, getLang?: () => (ReturnType<typeof createTypeScriptLanguageService> | Promise<ReturnType<typeof createTypeScriptLanguageService>>) }} */(config);
        var useLang = lang || (
          typeof configWithValue.getLang === 'function' ? configWithValue.getLang() : void 0
        );
        var cm = typeof configWithValue.getCM === 'function' ? configWithValue.getCM() : void 0;
        var fileText = cm ? cm.getValue() : void 0;

        var parsedJson = fileText && useLang && useLang.ts ? parseJsonLike(fileText, useLang) : void 0;

        if (lang && typeof lang.then === 'function') {
          lang.then(function(createdLang) {
            lang = createdLang;
            setTimeout(function() {
              if (cm) cm.refresh();
            })
          });
        }

        return {
          fileText: fileText,
          parsedJson: parsedJson,
          line: 0
        };
      }

      /**
       * @param {JSONReplyModeState} state
       */
      function processBlankLine(state) {
        state.line++;
      }

      /**
       * @param {import('codemirror').StringStream} stream
       * @param {JSONReplyModeState} state
       */
      function processToken(stream, state) {
        if (!state.parsedJson) {
          stream.skipToEnd();
          return 'text';
        }

        var lineStartPos = state.parsedJson.lineStarts[state.line];
        var currentSpanIndex = state.parsedJson.getSpanIndexAt(lineStartPos + stream.pos);
        var spanCh = stream.pos;
        var currentSpan = state.parsedJson.spans[currentSpanIndex];

        var nextSpan = state.parsedJson.spans[currentSpanIndex + 1];
        if (!nextSpan) {
          stream.skipToEnd();
        } else {
          for (var i = stream.pos; i < nextSpan.pos - lineStartPos; i++) {
            stream.next();
          }
        }
        if (stream.eol())
          state.line++;

        return 'line' + state.line + ' ' + 'ch' + spanCh +' ' + currentSpan.highlight;
      }
    }
    // #endregion

    /**
     * @returns {Promise<import('typescript')>}
     */
    function waitForTypeScriptLoad() {
      return new Promise(function (resolve, reject) {
        var waitUntil = getTimeNow() + 60 * 1000 * 1.5; // 1.5 minutes and timeout
        checkAndWait();

        function checkAndWait() {
          var ts = getGlobalTS();
          if (ts) resolve(ts);
          if (getTimeNow() > waitUntil) reject(new Error('TypeScript engine did not load in ample time.'));
          else setTimeout(checkAndWait, 300);
        }

        function getGlobalTS() {
          var _ts =
            // @ts-ignore
            typeof ts === 'undefined' ? void 0 : /** @type {import('typescript')} */(ts);

          if (_ts && typeof _ts.createLanguageService === 'function') return _ts;
        }
      });
    }

    /**
     * @param {{
     *  parentElement: HTMLElement;
     *  topChild: HTMLElement;
     *  splitterHeight: string;
     *  initialSplitterRatio: number;
     *  animateInMsec?: number;
     * }} options
     */
    function addHorizontalSplitterForBottom(options) {
      var parentElement = options.parentElement,
        topChild = options.topChild,
        splitterHeight = options.splitterHeight,
        initialSplitterRatio = options.initialSplitterRatio,
        animateInMsec = /** @type {number} */(options.animateInMsec) >= 0 ? options.animateInMsec : 300;

      var splitterRatio = initialSplitterRatio;

      setTimeout(function () {
        topChild.style.height = (initialSplitterRatio * 100).toFixed(2) + '%';
      }, animateInMsec);

      var splitterHeight = '3em';

      var bottomContainer = document.createElement('div');
      bottomContainer.style.cssText =
        'position: absolute; left: 0;' +
        ' top: ' + (initialSplitterRatio * 100).toFixed(2) + '%;' +
        ' width: 100%;' +
        ' height: ' + (100 - initialSplitterRatio * 100).toFixed(2) + '%;' +
        ' padding-top: ' + splitterHeight + ';' +
        ' transition: transform ' + animateInMsec + 'ms;' +
        ' transform: translateY(' + options.parentElement.offsetHeight + 'px)';
      setTimeout(function () {
        bottomContainer.style.transform = '';
      }, 1);
      var bottomHost = document.createElement('div');
      bottomHost.className = 'bottomHost';
      bottomHost.style.cssText =
        'position: relative; width: 100%; height: 100%;';
      bottomContainer.appendChild(bottomHost);
      parentElement.appendChild(bottomContainer);

      var splitterOuter = document.createElement('div');
      splitterOuter.id = 'splitterOuter';
      splitterOuter.style.cssText =
        'position: absolute; left: 0; top: 0; ' +
        ' width: 100%; ' +
        'padding-left: 5em; ' +
        ' height: ' + splitterHeight + ';';

      bottomContainer.appendChild(splitterOuter);

      on(splitterOuter, 'mousedown', splitter_mousedown);
      on(splitterOuter, 'mouseup', splitter_mouseup);
      on(splitterOuter, 'mousemove', splitter_mousemove);
      on(splitterOuter, 'touchstart', splitter_touchstart);
      on(splitterOuter, 'touchmove', splitter_touchmove);
      on(splitterOuter, 'touchend', splitter_touchend);

      return {
        bottomHost: bottomHost,
        splitterOuter: splitterOuter
      };

      /** @type {{
       *  centerY: number;
       *  offCenterY: number;
       *  splitterRatio: number;
       *  overlayElem: HTMLElement;
       *  latestDragY: number;
       * } | undefined} */
      var dragStart;

      /**
       * @param {number} pageY
       * @param {number} offsetY
       */
      function createDragOverlay(pageY, offsetY) {
        if (dragStart) return;
        // overlay whole window, nothing works until resizing complete
        var overlayElem = document.createElement('div');
        overlayElem.style.cssText =
          'position: absolute; position: fixed; ' +
          'left: 0; top: 0; width: 100%; height: 100%; ' +
          'z-index: 1000; ' +
          'cursor: ns-resize;';
        document.body.appendChild(overlayElem);
        on(overlayElem, 'mouseup', splitter_mouseup);
        on(overlayElem, 'mousemove', splitter_mousemove);
        on(overlayElem, 'touchend', splitter_touchend);
        dragStart = {
          centerY: pageY - offsetY,
          offCenterY: offsetY,
          splitterRatio: splitterRatio,
          overlayElem: overlayElem,
          latestDragY: pageY
        };
      }

      /**
       * @param {number} pageY
       */
      function dragTo(pageY) {
        if (!dragStart || pageY === dragStart.latestDragY) return;
        dragStart.latestDragY = pageY;
        var wholeSize = parentElement.offsetHeight;
        var newSplitterRatio = Math.min(0.9, Math.max(0.05,
          (pageY - dragStart.offCenterY) / wholeSize));

        var newTopHeight = (newSplitterRatio * 100).toFixed(2) + '%';
        var newBottomTop = (newSplitterRatio * 100).toFixed(2) + '%';
        var newBottomHeight = (100 - newSplitterRatio * 100).toFixed(2) + '%';

        if (topChild.style.height !== newTopHeight ||
          bottomContainer.style.top !== newBottomTop ||
          bottomContainer.style.height !== newBottomHeight) {
          var logmousemove = {
            topHeight: topChild.style.height + ' --> ' + newTopHeight,
            requestEditorHost: topChild,
            bottomTop: bottomContainer.style.top + '-->' + newBottomTop,
            bottomHeight: bottomContainer.style.height + '-->' + newBottomHeight,
            bottomContainer: bottomContainer
          };

          if (topChild.style.height !== newTopHeight) {
            topChild.style.height = newTopHeight;
            logmousemove.topHeight += ' (' + topChild.style.height + ')';
          }
          if (bottomContainer.style.top !== newBottomTop) {
            bottomContainer.style.top = newBottomTop;
            logmousemove.bottomTop += ' (' + bottomContainer.style.top + ')';
          }
          if (bottomContainer.style.height !== newBottomHeight) {
            bottomContainer.style.height = newBottomHeight;
            logmousemove.bottomHeight += ' (' + bottomContainer.style.height + ')';
          }

          // console.log('mousemove ', logmousemove);
        }

      }

      function dropOverlay() {
        if (dragStart)
          document.body.removeChild(dragStart.overlayElem);
        dragStart = void 0;
      }

      /** @param {MouseEvent} e */
      function splitter_mousedown(e) {
        if (!e) e = /** @type {MouseEvent} e */(window.event);
        if (e.preventDefault) e.preventDefault();
        createDragOverlay(e.pageY, e.offsetY);
        // console.log('mousedown ', dragStart);
      }

      /** @param {MouseEvent} e */
      function splitter_mouseup(e) {
        if (!e) e = /** @type {MouseEvent} e */(window.event);
        if (e.preventDefault) e.preventDefault();
        // console.log('mouseup ', dragStart);
        dropOverlay();
      }

      /** @param {MouseEvent} e */
      function splitter_mousemove(e) {
        if (!e) e = /** @type {MouseEvent} e */(window.event);
        if (e.preventDefault) e.preventDefault();
        if (!dragStart) return;

        dragTo(e.pageY);
      }

      /** @param {TouchEvent} e */
      function splitter_touchstart(e) {
        if (!e) e = /** @type {TouchEvent} e */(window.event);
        if (e.preventDefault) e.preventDefault();
        var touches = e.changedTouches || e.touches;
        var tch = touches && touches[0];
        if (tch && tch.pageY > 0) {
          createDragOverlay(tch.pageY, tch.pageY - topChild.offsetHeight);
        }
      }

      /** @param {TouchEvent} e */
      function splitter_touchend(e) {
        if (!e) e = /** @type {TouchEvent} e */(window.event);
        if (e.preventDefault) e.preventDefault();
        dropOverlay();
      }

      /** @param {TouchEvent} e */
      function splitter_touchmove(e) {
        if (!dragStart) return;
        if (!e) e = /** @type {TouchEvent} e */(window.event);
        if (e.preventDefault) e.preventDefault();
        var touches = e.touches || e.changedTouches;
        var tch = touches && touches[0];
        for (var i = 0; touches && i < touches.length; i++) {
          if (Math.abs(touches[i].pageY - dragStart.latestDragY) < Math.abs(tch.pageY - dragStart.latestDragY))
            tch = touches[i];
        }

        if (tch && tch.pageY > 0)
          dragTo(tch.pageY);
      }
    }

    /** @typedef{{
     *  label: HTMLElement;
     *  content: HTMLElement;
     * }} TabController */

    /**
     * @param {{
     *  host: HTMLElement;
     * }} options
     */
    function createTabs(options) {
      var host = options.host;
      var containers = populateHostDOM(host);

      /** @type {TabEntry | undefined} */
      var currentTab;

      var tabsObject = {
        addTab: addTab,
        switchToTab: switchToTab,
        getCurrentTab: getCurrentTab,
        ontabswitched: void 0
      };

      /** @typedef {{
       *  controller: TabController;
       *  accent: string;
       *  headerElem: HTMLElement;
       *  labelElem: HTMLElement;
       *  contentElem: HTMLElement;
       * }} TabEntry */

      /** @type {TabEntry[]} */
      var tabEntryList = [];

      var animationMsec = 200;

      return tabsObject;

      /**
       * @param {{
       *  accent: string;
       *  label: string;
       * }} tabOptions 
       */
      function addTab(tabOptions) {
        var headerElem = document.createElement('div');
        headerElem.style.color = tabOptions.accent;
        headerElem.style.transition = 'transform ' + animationMsec + 'ms';
        headerElem.className = 'tab-header';
        var labelElem = document.createElement('div');
        labelElem.className = 'tab-label';
        set(labelElem, tabOptions.label);
        headerElem.appendChild(labelElem);
        var contentElem = document.createElement('div');
        contentElem.className = 'tab-content';
        contentElem.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
        containers.tabsHeadersContainer.appendChild(headerElem);
        containers.tabsContentsContainer.appendChild(contentElem);

        /** @type {TabEntry} */
        var tabEntry = {
          controller: { label: labelElem, content: contentElem },
          accent: tabOptions.accent,
          headerElem: headerElem,
          labelElem: labelElem,
          contentElem: contentElem
        };

        tabEntryList.push(tabEntry);

        switchToTab(tabEntry.controller);

        headerElem.ontouchstart = onClick;
        headerElem.onmousedown = onClick;
        headerElem.onclick = onClick;
        return tabEntry.controller;

        /** @param {Event} e */
        function onClick(e) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopImmediatePropagation === 'function') e.stopPropagation();
          if ('cancelBubble' in e) e.cancelBubble = true;

          switchToTabEntry(tabEntry);
        }
      }

      function getCurrentTab() {
        return currentTab && currentTab.controller;
      }

      var animateTimeout;
      /** @type {Function | undefined} */
      var completeAnimation;

      /** @param {TabEntry} toTab */
      function switchToTabEntry(toTab) {
        if (currentTab === toTab) return;

        clearTimeout(animateTimeout);
        if (completeAnimation) {
          completeAnimation();
          completeAnimation = void 0;
        }

        if (currentTab) {
          var fromTab = currentTab;
          fromTab.headerElem.className = (fromTab.headerElem.className || '').replace(/(^|\s)active($|\s)/g, ' ').replace(/\s+$/, '') + ' inactive';

          fromTab.contentElem.style.transition = 'none';
          toTab.contentElem.style.transition = 'none';

          completeAnimation = function () {
            fromTab.contentElem.style.transition = 'none';
            fromTab.contentElem.style.visibility = 'none';
            fromTab.contentElem.style.opacity = '0';
            fromTab.contentElem.style.zIndex = '1';
            fromTab.contentElem.style.pointerEvents = 'none';

            toTab.contentElem.style.visibility = '';
            toTab.contentElem.style.opacity = '1';
            toTab.contentElem.style.zIndex = '10';
            toTab.contentElem.style.pointerEvents = 'all';
            completeAnimation = void 0;
          };

          animateTimeout = setTimeout(function () {
            fromTab.contentElem.style.opacity = '1';
            fromTab.contentElem.style.zIndex = '9';

            toTab.contentElem.style.opacity = '0';
            toTab.contentElem.style.zIndex = '10';

            fromTab.contentElem.style.pointerEvents = 'none';
            toTab.contentElem.style.pointerEvents = 'all';

            fromTab.contentElem.style.visibility = '';
            toTab.contentElem.style.visibility = '';

            animateTimeout = setTimeout(function () {
              fromTab.contentElem.style.transition = 'opacity ' + animationMsec + 'ms, trasform ' + Math.floor(animationMsec/2) + 'ms';
              toTab.contentElem.style.transition = 'opacity ' + animationMsec + 'ms, trasform ' + Math.floor(animationMsec/2) + 'ms';

              animateTimeout = setTimeout(function () {
                toTab.contentElem.style.opacity = '1';
                animateTimeout = setTimeout(function () {
                  fromTab.contentElem.style.opacity = '0';

                  animateTimeout = setTimeout(function () {
                    fromTab.contentElem.style.transition = 'none';
                    toTab.contentElem.style.transition = 'none';

                    animateTimeout = setTimeout(/** @type {Function} */(completeAnimation), 1);
                  }, animationMsec + 10);
                }, animationMsec);
              }, 1);
            }, 1);
          }, 1);
        } else {
          toTab.contentElem.style.zIndex = '10';
        }

        toTab.headerElem.className = (toTab.headerElem.className || '').replace(/(^|\s)inactive($|\s)/g, ' ').replace(/\s+$/, '') + ' active';
        currentTab = toTab;
      }

      /** @param {TabController} tabController */
      function findTabEntryForTabController(tabController) {
        for (var i = 0; i < tabEntryList.length; i++) {
          if (tabEntryList[i].controller === tabController) return tabEntryList[i];
        }
      }

      /** @param {TabController} tab */
      function switchToTab(tab) {
        var tabEntry = findTabEntryForTabController(tab);
        if (!tabEntry) throw new Error('Tab is not found');

        return switchToTabEntry(tabEntry);
      }

      /** @param {HTMLElement} host */
      function populateHostDOM(host) {
        host.innerHTML = getFunctionCommentContent(function () {/*
        <table style="width: 100%; height: 100%; spacing: 0; padding: 0;" cellspacing=0 cellpadding=0>
        <tr><td height=1 style="height: 1px; padding-left: 7em; padding-top: 1.5em;"><div class=tabs-headers-container style="position: relative"></div></td></tr>
        <tr><td height="99%" class=tabs-contents-container style="position: relative">
        </td></tr></table>
      */});

        /** @type {HTMLElement} */
        var tabsHeadersContainer;
        /** @type {HTMLElement} */
        var tabsContentsContainer;

        var elemLists = ['td', 'div'];
        for (var iElem = 0; iElem < elemLists.length; iElem++) {
          var allElems = host.getElementsByTagName(elemLists[iElem]);
          for (var i = 0; i < allElems.length; i++) {
            var child = /** @type {HTMLElement} */(allElems[i]);
            if (!child) continue;
            switch (child.className) {
              case 'tabs-headers-container': tabsHeadersContainer = child; break;
              case 'tabs-contents-container': tabsContentsContainer = child; break;
            }
          }
        }

        return {
          // @ts-ignore
          tabsHeadersContainer: tabsHeadersContainer,
          // @ts-ignore
          tabsContentsContainer: tabsContentsContainer
        };
      }
    }

    /**
     * @param {string} text
     * @param {string} verb
     */
    function shell(text, verb) {

      injectShellStyles();
      var layout = bindLayout();
      if (!layout.allFound) {
        if (layout.shell && layout.shell.parentElement) layout.shell.parentElement.removeChild(layout.shell);
        layout = injectShellHTML();
      }

      init();

      return {
        loadingTakesTime: loadingTakesTime,
        loadingComplete: loadingComplete
      };

      function init() {
        var useText =
          verb === 'splash' ? getSplash() : text;
        layout.pseudoEditor.value = useText;
        layout.pseudoGutter.innerHTML =
          Array(useText.split('\n').length + 1)
            .join(',').split(',')
            .map(function (_, index) { return index + 1; }).join('<br>');
        layout.leftBottom.style.whiteSpace = 'nowrap';
        set(layout.leftBottom, drinkChar + ' Loading..');
      }

      function loadingTakesTime() {
        layout.pseudoEditor.value = (layout.pseudoEditor.value || '').replace(/^Loading\.\./, 'Loading...');
        set(layout.leftBottom, drinkChar + ' Loading...');
        // TODO: whatever progress...
      }

      /**
       * @param {(text: string) => void | undefined | Promise<void | unknown>} persist
       * @param {string=} textOverride
       * @param {string=} modeOverride
       */
      function loadingComplete(persist, textOverride, modeOverride) {
        if (typeof textOverride !== 'undefined') text = textOverride;
        if (typeof modeOverride !== 'undefined') verb = modeOverride;
        set(layout.leftBottom, '');
        var aboutLink = document.createElement('a');
        aboutLink.href = './';
        aboutLink.style.cssText = 'display: inline-block; color: inherit; padding-left: 0.5em; pointer-events: all;';
        layout.leftBottom.appendChild(aboutLink);
        set(aboutLink, 'About ' + drinkChar);

        /** @type {import('codemirror').Editor[]} */
        var tabBetweenEditors = [];

        var addedCommands = /** @type {import('codemirror').KeyMap} */ ({
          Tab: executeTabKeyCommand,
          'Ctrl-Enter': executeSendRequestCommand,
          'Cmd-Enter': executeSendRequestCommand,
          'Ctrl-B': executeApplyBoldModifierCommand,
          'Cmd-B': executeApplyBoldModifierCommand,
          'Ctrl-I': executeApplyItalicModifierCommand,
          'Cmd-I': executeApplyItalicModifierCommand,
          'Ctrl-U': executeApplyUnderlinedModifierCommand,
          'Cmd-U': executeApplyUnderlinedModifierCommand,
          'Ctrl-P': executeApplyPlateModifierCommand,
          'Cmd-P': executeApplyPlateModifierCommand,
          'Ctrl-R': executeApplyRoundModifierCommand,
          'Cmd-R': executeApplyRoundModifierCommand,
          'Ctrl-T': executeApplyTypewriterModifierCommand,
          'Cmd-T': executeApplyTypewriterModifierCommand
        });

        // @ts-ignore
        CodeMirror
          .defineMode('rest-request', restRequestMode);
        var replyModeDefined = false;

        layout.requestEditorHost.innerHTML = '';
        /** @type {import('codemirror').EditorConfiguration} */
        var cmOptions = {
          // @ts-ignore
          lineNumbers: true,
          extraKeys: addedCommands,
          // @ts-ignore
          foldGutter: true,
          gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
          lineWrapping: true,
          autofocus: true
        };

        if (verb === 'splash') {
          cmOptions.value = getSplash();
          cmOptions.mode = 'markdown';
          var editor = createCodeMirrorWithFirstClickChange(
            layout.requestEditorHost,
            cmOptions,
            function () {
              editor.setOption('mode', isPlainTextVerb(verb) ? 'markdown' : 'rest-request');
              editor.setValue(text);
              editor.on('changes', debounce(function () {
                updateVerbAutoDetect(true);
              }, 200, 900));
              updateVerbAutoDetect();
            });
        } else {
          cmOptions.value = text;
          cmOptions.mode = 'rest-request';
          var editor =
            // @ts-ignore
            CodeMirror(
              layout.requestEditorHost,
              cmOptions
            );

          editor.on('changes', debounce(function () {
            updateVerbAutoDetect(true);
          }, 200, 900));

          updateVerb(verb);
        }

        tabBetweenEditors.push(editor);

        addLinedPaperHandling(editor);

        asyncGetTypeScriptLanguageService();

        /** @type {ReturnType<typeof createRequestVerbSidebarLayout>} */
        var requestVerbSidebarLayout;
        /** @type {ReturnType<typeof createPlainTextSidebarLayout>} */
        var plainTextSidebarLayout;

        var _lang;
        function getTypeScriptLanguageService() {
          if (_lang) return _lang;
          else return asyncGetTypeScriptLanguageService();
        }

        function asyncGetTypeScriptLanguageService() {
          if (_lang) return Promise.resolve(/** @type {ReturnType<typeof createTypeScriptLanguageService>} */(_lang));
          return waitForTypeScriptLoad().then(function (ts) {
            if (!_lang) _lang = createTypeScriptLanguageService(ts);
            return /** @type {ReturnType<typeof createTypeScriptLanguageService>} */(_lang);
          });
        }

        /** @type {{
         *  withSplitter: ReturnType<typeof requireSplitter>;
         *  tabs?: ReturnType<typeof createTabs>;
         *  rawReply?: {
         *    editor: import('codemirror').Editor;
         *    tab: TabController;
         *  };
         *  structuredReply?: {
         *    editor: import('codemirror').Editor;
         *    tab: TabController;
         *  }
         * } | undefined} */
        var _bottomDetailsInstance;
        function getBottomDetails() {
          if (!_bottomDetailsInstance) {
            _bottomDetailsInstance = {
              withSplitter: requireSplitter()
            };
          }

          return _bottomDetailsInstance;
        }

        // @ts-ignore
        /** @template T, K @typedef{Omit<T, K> & {[P in K]: NonNullable<T[P]>}} WithNonNullable */

        function isBottomDetailsInstantiated() {
          return /** @type {unknown} */_bottomDetailsInstance;
        }

        /** @param {{
         *  lang: ReturnType<typeof createTypeScriptLanguageService>;
         *  host: HTMLElement;
         *  text: string;
         *  onFocus: () => void;
         * }} opts */
        function createBottomCodeMirror(opts) {
          if (!replyModeDefined) {
            // @ts-ignore
            CodeMirror
              .defineMode('rest-reply', function (config, modeOptions) {
                /** @type {typeof config & {lang?: ReturnType<typeof createTypeScriptLanguageService>, getValue?(): string }} */
                var configClone = Object.assign({}, config);
                configClone.lang = opts.lang;
                return jsonReplyMode(configClone, modeOptions);
              });
            replyModeDefined = true;
          }

          var cm =
            //@ts-ignore
            CodeMirror(
              opts.host,
              {
                value: opts.text,
                // @ts-ignore
                getCM: function () { return cm; },
                // @ts-ignore
                getLang: getTypeScriptLanguageService,

                mode: 'rest-reply',

                // @ts-ignore
                foldGutter: true,
                gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
                extraKeys: {
                  Tab: executeTabKeyCommand
                },

                lineNumbers: true,
                readOnly: true,
                lineWrapping: true
              });

          var copyFocus = cm.focus.bind(cm);
          cm.focus = function () {
            copyFocus();
            opts.onFocus();
            setTimeout(function () {
              copyFocus();
            }, 10);
          };

          tabBetweenEditors.push(cm);

          addLinedPaperHandling(cm);

          return cm;
        }

        function getBottomDetailsWithTabs() {
          var bt = /** @type {WithNonNullable<ReturnType<typeof getBottomDetails>, 'tabs'>} */(
            getBottomDetails());
          if (bt.tabs) return bt;

          bt.tabs = createTabs({ host: bt.withSplitter.bottomHost });
          return bt;
        }

        /**
         * @param {ReturnType<typeof createTypeScriptLanguageService>} lang
         * @param {string=} text
         */
        function  getBottomDetailsWithRawReply(lang, text) {
          var bt = /** @type {WithNonNullable<ReturnType<typeof getBottomDetailsWithTabs>, 'rawReply'>} */(
            getBottomDetailsWithTabs());
          if (bt.rawReply) {
            if (typeof text === 'string') bt.rawReply.editor.setValue(text);
            return bt;
          }

          var tab = bt.tabs.addTab({ accent: 'silver', label: 'Reply' });
          var cm = createBottomCodeMirror({
            lang: lang,
            host: tab.content,
            text: text || '',
            onFocus: function () { bt.tabs.switchToTab(tab); }
          });
          tab.content.className += ' bottom-raw-reply';

          var rawReply = {
            editor: cm,
            tab: tab
          };
          bt.rawReply = rawReply;

          return bt;
        }

        /** @param {ReturnType<typeof createTypeScriptLanguageService>} lang */
        function getBottomDetailsWithStructuredReply(lang) {
          var bt = /** @type {WithNonNullable<ReturnType<typeof getBottomDetailsWithRawReply>, 'structuredReply'>} */(
            getBottomDetailsWithRawReply(lang)
          );

          if (bt.structuredReply) {
            bt.tabs.switchToTab(bt.structuredReply.tab);
            return bt;
          }

          var tab = bt.tabs.addTab({ accent: '#02cccc', label: 'Data' });

          var cm = createBottomCodeMirror({
            lang: lang,
            host: tab.content,
            text: '',
            onFocus: function () { bt.tabs.switchToTab(tab) }
          });
          tab.content.className += ' bottom-structured-reply';

          var structuredReply = {
            tab: tab,
            editor: cm
          };
          bt.structuredReply = structuredReply;

          return bt;
        }


        /** @param {import('codemirror').Editor} editor */
        function addLinedPaperHandling(editor) {
          /** @type {{ lineHandle: import('codemirror').LineHandle, lineElem: HTMLElement, linedPaperElem: HTMLElement } | undefined} */
          var lastLineEntry;

          var updateLinedPaperHeightTimeout;
          var updateLinedPaperDelay = 10;
          editor.on('refresh', function () {
            queueUpdate();
          });

          editor.on('scroll', function () {
            queueUpdate();
          });

          editor.on('renderLine', renderLineHandler);

          updateLinedPaperHeightTimeout = setTimeout(updateLinedPaperHeight, 10);

          if (typeof ResizeObserver === 'function') {
            var resizeObserver = new ResizeObserver(function () {
              queueUpdate();
            });
            resizeObserver.observe(editor.getWrapperElement());
            var parent = editor.getWrapperElement().parentElement;
            if (parent) resizeObserver.observe(parent);
          }
          on(editor.getWrapperElement(), 'mousemove', queueUpdateLong);
          on(editor.getWrapperElement(), 'mouseup', queueUpdateLong);
          on(editor.getWrapperElement(), 'touchstart', queueUpdateLong);
          on(editor.getWrapperElement(), 'touchmove', queueUpdateLong);

          editor.refresh();

          function queueUpdateLong() {
            queueUpdate(900);
          }

          /** @param {number=} time */
          function queueUpdate(time) {
            if (!lastLineEntry) return;

            if (!time) time = 10;
            if (updateLinedPaperHeightTimeout && updateLinedPaperDelay < time) return; // if it's urgent, keep it urgent

            updateLinedPaperDelay = time;

            clearTimeout(updateLinedPaperHeightTimeout);
            updateLinedPaperHeightTimeout = setTimeout(updateLinedPaperHeight, time || 10);
          }

          function updateLinedPaperHeight() {
            updateLinedPaperDelay = 10;
            updateLinedPaperHeightTimeout = 0;
            if (!lastLineEntry) return;
            var doc = editor.getDoc();
            if (typeof doc.getLineNumber(lastLineEntry.lineHandle) !== 'number') return;

            var scrollInfo = editor.getScrollInfo();
            var top = editor.charCoords({ line: 0, ch: 1 }).top;
            var bottom = editor.charCoords({ line: doc.lineCount(), ch: 1 }).bottom;
            var contentHeight = bottom - top;
            var gapHeight = scrollInfo.clientHeight > contentHeight ? scrollInfo.clientHeight - contentHeight + 40 : void 0;
            var gapHeightStr = (gapHeight || 0) + 'px';
            if (lastLineEntry.linedPaperElem.style.height != gapHeightStr) {
              lastLineEntry.linedPaperElem.style.height = gapHeightStr;
            }
          }

          /**
           * @param {import('codemirror').Editor} cm
           * @param {import('codemirror').LineHandle} lineHandle
           * @param {HTMLElement} domElem
           */
          function renderLineHandler(cm, lineHandle, domElem) {
            var doc = cm.getDoc();
            var lastLine = doc.getLineNumber(lineHandle) === doc.lineCount() - 1;
            if (!lastLine) return;

            var linedPaperElem = document.createElement('div');
            linedPaperElem.className = 'lined-paper';
            // linedPaperElem.style.height = gapHeight + 'px';
            linedPaperElem.style.display = 'block';
            domElem.appendChild(linedPaperElem);

            lastLineEntry = {
              lineHandle: lineHandle,
              lineElem: domElem,
              linedPaperElem: linedPaperElem
            };

            queueUpdate();
          }
        }

        /** @param {string} newVerb */
        function updateVerb(newVerb) {
          verb = newVerb;

          if (!verb || isPlainTextVerb(verb)) {
            if (requestVerbSidebarLayout) {
              requestVerbSidebarLayout.container.style.zIndex = '10';
              requestVerbSidebarLayout.container.style.pointerEvents = 'none';
              requestVerbSidebarLayout.container.style.opacity = '0';
            }
            if (isBottomDetailsInstantiated()) {
              // retain?
            }

            if (!plainTextSidebarLayout) {
              plainTextSidebarLayout = createPlainTextSidebarLayout();
              layout.leftTop.appendChild(plainTextSidebarLayout.container);
              for (var iButton = 0; iButton < plainTextSidebarLayout.buttons.length; iButton++) {
                addHandler(plainTextSidebarLayout.buttons[iButton]);
              }
            } else {
              plainTextSidebarLayout.container.style.pointerEvents = 'all';
              plainTextSidebarLayout.container.style.opacity = '1';
            }

          } else {
            if (plainTextSidebarLayout) {
              plainTextSidebarLayout.container.style.zIndex = '10';
              plainTextSidebarLayout.container.style.pointerEvents = 'none';
              plainTextSidebarLayout.container.style.opacity = '0';
            }

            if (!requestVerbSidebarLayout) {
              requestVerbSidebarLayout = createRequestVerbSidebarLayout();
              layout.leftTop.appendChild(requestVerbSidebarLayout.container);

              var clickTimeout;
              requestVerbSidebarLayout.goButton.onclick = function (e) {
                if (!e) e = /** @type {MouseEvent} */(window.event);
                if (e.preventDefault) e.preventDefault();
                clearTimeout(clickTimeout);
                clickTimeout = setTimeout(function () {
                  executeSendRequestCommand();
                }, 100);
              };
            } else {
              requestVerbSidebarLayout.container.style.pointerEvents = 'all';
              requestVerbSidebarLayout.container.style.opacity = '1';
            }

            set(requestVerbSidebarLayout.goButton, verb.toUpperCase());
          }
        }

        function createRequestVerbSidebarLayout() {
          var layoutElem = document.createElement('div');
          layoutElem.id = 'requestModeSidebar';
          layoutElem.style.cssText = 'transition: opacity 350ms; position: absolute; height: 100%;'
          layoutElem.innerHTML = '<button class=goButton></button>';
          var goButton = /** @type {HTMLButtonElement} */(layoutElem.getElementsByTagName('button')[0]);

          return {
            container: layoutElem,
            goButton: goButton
          };
        }

        function createPlainTextSidebarLayout() {
          var layoutElem = document.createElement('div');
          layoutElem.id = 'editorModeSidebar';
          layoutElem.style.cssText = 'transition: opacity 350ms; position: absolute; overflow-y: auto; height: 100%;'
          layoutElem.innerHTML = createButtonsHTML();

          var buttons = [];
          var buttonList = layoutElem.getElementsByTagName('button');
          for (var i = 0; i < buttonList.length; i++) {
            var btn = buttonList[i] || (buttonList.item ? buttonList.item(i) : void 0);
            if (btn) {
              buttons.push(btn);
            }
          }

          updateModifierButtonsForSelection();

          var modifierButtonTimeout;
          editor.on('cursorActivity', function () {
            clearTimeout(modifierButtonTimeout);
            modifierButtonTimeout = setTimeout(updateModifierButtonsForSelection, 10);
          });

          return {
            container: layoutElem,
            buttons: buttons
          };

          var btnPressedClassNameRegexp;

          function updateModifierButtonsForSelection() {
            if (!btnPressedClassNameRegexp) btnPressedClassNameRegexp = /\s*\bpressed\b\s*/g;

            var selection = getCurrentSelection();
            var modTextSection = getModifiersTextSection(selection.text, selection.startPos, selection.endPos);

            for (var i = 0; i < buttons.length; i++) {
              var btn = /** @type {HTMLButtonElement} */(buttons[i]);
              if (btn.id) {
                var pressed = modTextSection && modTextSection.parsed && modTextSection.parsed.modifiers.indexOf(btn.id) >= 0;

                if (pressed && !(btnPressedClassNameRegexp.test(btn.className || ''))) btn.className = trimEnd(btn.className || '') + ' pressed';
                else if (btnPressedClassNameRegexp.test(btn.className || '')) btn.className = btn.className.replace(btnPressedClassNameRegexp, ' ');
              }
            }
          }

          function createButtonsHTML() {
            var buttonsHTML = '';
            var addedSymbols = '';
            var modList = [];
            for (var mod in variants) {
              if (mod !== 'bold' && /^bold/.test(mod)) continue;
              modList.push(mod);
              // underline is treated differently, keep track of it though
              if (mod === 'italic') modList.push('underlined');
            }

            for (var i = 0; i < modList.length; i++) {
              var mod = modList[i];
              var symbolPlain = mod.charAt(0);
              if (addedSymbols.indexOf(symbolPlain) >= 0) symbolPlain = mod.charAt(mod.length - 1);
              addedSymbols += symbolPlain;
              var symbolFormatted = applyModifierToPlainCh(symbolPlain.toUpperCase(), mod === 'fractur' || mod === 'cursive' ? ['bold' + mod] : [mod]);
              var symbolHTML = symbolPlain === mod.charAt(0) ?
                '<span class=symbol-formatted>' + symbolFormatted + '</span>' +
                (mod === 'underlined' ?
                  '<span style="position:relative;top: -0.5em;">nder<span style="position: absolute; left: 0; top: 1em">lined</span></span>' :
                  mod.slice(1)
                ) :
                mod.slice(0, mod.length - 1) + '<span class=symbol-formatted>' + symbolFormatted + '</span>';

              buttonsHTML += '<button id=' + mod + '><span class=mod-button-content>' + symbolHTML + '</span></button>';
            }
            return buttonsHTML;
          }
        }

        function getCurrentSelection() {
          var text = editor.getValue();
          var startCoord = editor.getCursor('from');
          var endCoord = editor.getCursor('to');
          var startPos = editor.indexFromPos(startCoord);
          var endPos = editor.indexFromPos(endCoord);

          if (startPos > endPos) {
            var _m = endPos;
            endPos = startPos;
            startPos = _m;
          }

          return {
            text: text,
            startPos: startPos,
            endPos: endPos,
            startCoord: startCoord,
            endCoord: endCoord
          };
        }

        /** @param {HTMLButtonElement} btn */
        function addHandler(btn) {
          btn.onmousedown = btn_onmousedown;
          btn.onmouseup = btn_mouseup;
          btn.onclick = btn_click;

          /** @param {MouseEvent} evt */
          function btn_onmousedown(evt) {
            if (evt.preventDefault) evt.preventDefault();
            if (evt.stopPropagation) evt.stopPropagation();
            if ('cancelBubble' in evt) evt.cancelBubble = true;

            handleClick();
          }

          /** @param {MouseEvent} evt */
          function btn_mouseup(evt) {
            if (evt.preventDefault) evt.preventDefault();
            if (evt.stopPropagation) evt.stopPropagation();
            if ('cancelBubble' in evt) evt.cancelBubble = true;
          }

          /** @param {MouseEvent} evt */
          function btn_click(evt) {
            if (evt.preventDefault) evt.preventDefault();
            if (evt.stopPropagation) evt.stopPropagation();
            if ('cancelBubble' in evt) evt.cancelBubble = true;
          }

          function handleClick() {
            var modifier = btn.id;
            var remove = (btn.className || '').indexOf('pressed') >= 0;
            applyModifierToSelection(modifier, remove);
            if (remove) btn.className = (btn.className || '').replace(/(\s+|^)pressed(\s+|$)/g, ' ');
            else btn.className = (btn.className || '').replace(/\s+$/, '') + 'pressed';
          }
        }

        /**
         * @param modifier {string}
         * @param remove {boolean=}
         **/
        function applyModifierToSelection(modifier, remove) {
          var selection = getCurrentSelection();

          if (!modifier || !selection.text) return;

          var leadText = selection.text.slice(0, selection.startPos);
          var modifyText = selection.text.slice(selection.startPos, selection.endPos);
          var trailText = selection.text.slice(selection.endPos);

          if (!modifyText) return;

          var replacedModifyText = applyModifier(
            modifyText,
            modifier,
            remove);

          var newText = leadText + replacedModifyText + trailText;

          if (selection.text !== newText) {
            editor.replaceSelection(replacedModifyText, 'around');
            return true;
            // editor.setValue(newText);
            // if (selectionStartPos !== leadText.length) {
            //   //editor.setSelection().selectionStart = leadText.length;
            // }
            // //if (textarea.selectionEnd !== newText.length - trailText.length) textarea.selectionEnd = newText.length - trailText.length;

            // // onchange - already triggers?
          }
        }

        /**
         * @param {boolean=} shouldPersist
         */
        function updateVerbAutoDetect(shouldPersist) {
          var value = editor.getValue();
          var pars = parseTextRequest(value);
          if (pars && pars.firstLine) {
            var parsFirst = parseFirstLine(pars.firstLine);
          }

          var detectedVerb = parsFirst && parsFirst.verb || 'edit';

          if (detectedVerb !== verb) {
            updateVerb(detectedVerb);
          }

          if (parsFirst && parsFirst.verbPos > 0) {
            // highlight inside CodeMirror
          }

          if (shouldPersist)
            persist(value);
        }

        /**
         * @param {HTMLElement} host
         * @param {import('codemirror').EditorConfiguration} options
         * @param {Function} firstClickCallback
         */
        function createCodeMirrorWithFirstClickChange(host, options, firstClickCallback) {
          /** @type {import('codemirror').Editor} */
          var editor =
            // @ts-ignore
            CodeMirror(
              host, options);

          var leftClickKeyMap = { LeftClick: onFirstClick, LeftDoubleClick: onFirstClick };
          editor.addKeyMap(leftClickKeyMap);
          editor.on('cursorActivity', onFirstClick);
          editor.on('beforeSelectionChange', onFirstClick);
          editor.on('dblclick', onFirstClick);
          editor.on('touchstart', onFirstClick);

          return editor;

          function onFirstClick() {
            setTimeout(function () {
              editor.removeKeyMap(leftClickKeyMap);
              editor.off('cursorActivity', onFirstClick);
              editor.off('beforeSelectionChange', onFirstClick);
              editor.off('dblclick', onFirstClick);
              editor.off('touchstart', onFirstClick);
              return firstClickCallback();
            }, 50);
          }

        }

        function requireSplitter() {
          var textStart = editor.charCoords({ ch: 1, line: 0 });
          var textEnd = editor.charCoords({ ch: 1, line: editor.getDoc().lineCount() + 1 });
          var wholeHeight =
            layout.contentPageHost.offsetHeight ||
            (layout.contentPageHost.getBoundingClientRect ? layout.contentPageHost.getBoundingClientRect().height :
              window.innerHeight);

          var wholeTextHeight = textEnd.bottom - Math.min(textStart.top, 0);
          var addPaddingUnderText = 30;
          var initialSplitterRatio = wholeTextHeight + addPaddingUnderText < wholeHeight / 2 ? (wholeTextHeight + addPaddingUnderText) / wholeHeight : 0.5;

          var splitterLayout = addHorizontalSplitterForBottom({
            parentElement: layout.contentPageHost,
            topChild: layout.requestEditorHost,
            initialSplitterRatio: initialSplitterRatio,
            splitterHeight: '3em'
          });

          var bottomHost = splitterLayout.bottomHost;
          var splitterOuter = splitterLayout.splitterOuter;

          var splitterContainer = document.createElement('div');
          splitterContainer.style.cssText =
            'position: relative; width: 100%; height: 100%;';
          splitterContainer.id = 'splitter';
          splitterOuter.appendChild(splitterContainer);

          splitterContainer.innerHTML =
            '<table style="width: 100%; height: 100%; position: absolute;" cellspacing=0 cellpadding=0> ' +
            '<tr><td id=splitterLabel></td></tr></table>';
          var splitterMainPanel = splitterContainer.getElementsByTagName('td')[0];

          return {
            bottomHost: bottomHost,
            splitterContainer: splitterContainer,
            splitterMainPanel: splitterMainPanel
          };
        }

        /** @param {string} mod */
        function applyModifierCommand(mod) {
          var selection = getCurrentSelection();
          if (!selection.text) return; // TODO: can we apply to the current word instead?

          var modifiers = getModifiersTextSection(selection.text, selection.startPos, selection.endPos);
          var remove = false;
          if (modifiers && modifiers.parsed) {
            for (var i = 0; i < modifiers.parsed.length; i++) {
              var parsChunk = modifiers.parsed[i];
              if (typeof parsChunk === 'string') continue;
              if (parsChunk.fullModifiers.indexOf(mod) >= 0) {
                remove = true;
                break;
              }
            }
          }

          return applyModifierToSelection(mod, remove);
        }

        function executeApplyBoldModifierCommand() { return applyModifierCommand('bold'); }
        function executeApplyItalicModifierCommand() { return applyModifierCommand('italic'); }
        function executeApplyPlateModifierCommand() { return applyModifierCommand('plate'); }
        function executeApplyRoundModifierCommand() { return applyModifierCommand('round'); }
        function executeApplyTypewriterModifierCommand() { return applyModifierCommand('typewriter'); }
        function executeApplyUnderlinedModifierCommand() { return applyModifierCommand('underlined'); }

        /** @type {{timeout: number, elem: HTMLElement} | undefined} */
        var flyingCursor;

        /** @param {import('codemirror').Editor} cm */
        function executeTabKeyCommand(cm) {
          var editorPos = tabBetweenEditors.indexOf(cm);
          if (editorPos < 0) return;
          var nextCm = tabBetweenEditors[(editorPos + 1) % tabBetweenEditors.length];

          if (nextCm === cm) return;

          var cursorCoordPos = cm.cursorCoords();
          var nextCursorCoordPos = nextCm.cursorCoords();

          if (cursorCoordPos && nextCursorCoordPos) {
            if (flyingCursor) {
              clearTimeout(flyingCursor.timeout);
              if (flyingCursor.elem.parentElement) flyingCursor.elem.parentElement.removeChild(flyingCursor.elem);
              flyingCursor = undefined;
            }

            var animationMsec = 200;

            // animate some movement
            var elem = document.createElement('div');
            elem.style.cssText =
              'position: fixed; ' +
              'left: ' + cursorCoordPos.left + 'px; ' +
              'top: ' + cursorCoordPos.top  + 'px; ' +
              'width: 2px; ' +
              'height: ' + (cursorCoordPos.bottom - cursorCoordPos.top) + 'px; ' +
              'transition: transform ' + animationMsec + 'ms ease-in, opacity '+ animationMsec + 'ms; ' +
              'background: black; ' +
              'border: solid 1px rgba(255,255,255,0.5); ' +
              'z-index: 2000; ' +
              'pointer-events: none; ';

            document.body.appendChild(elem);
            var currentFlying = flyingCursor = {
              elem: elem,
              timeout: /** @type {*} */(setTimeout(function () {
                elem.style.transform =
                  'translate(' + (nextCursorCoordPos.left - cursorCoordPos.left - 1) + 'px, ' + (nextCursorCoordPos.top - cursorCoordPos.top) + 'px) ' +
                  'scale(1.3)';
                elem.style.opacity = '0.9';
                currentFlying.timeout = setTimeout(function () {
                  elem.style.transform =
                    'translate(' + (nextCursorCoordPos.left - cursorCoordPos.left - 1) + 'px, ' + (nextCursorCoordPos.top - cursorCoordPos.top) + 'px) ' +
                    'scale(4)';
                  elem.style.opacity = '0';
                  currentFlying.timeout = setTimeout(function () {
                    if (currentFlying && currentFlying.elem.parentElement)
                      currentFlying.elem.parentElement.removeChild(currentFlying.elem);
                    flyingCursor = void 0;
                  }, animationMsec * 0.9);
                }, animationMsec + 5);
              }, 1))
            };
          }

          nextCm.focus();
        }

        var lastSendRequestInstance;
        function executeSendRequestCommand() {
          var sendRequestInstance = lastSendRequestInstance = {};

          var pars = parseTextRequest(editor.getValue());

          if (!pars || !pars.firstLine) return;
          var parsFirst = parseFirstLine(pars.firstLine);

          if (!parsFirst || !parsFirst.url) return;

          editor.setOption('readOnly', true);
          var bt = getBottomDetails();
          if (bt.tabs && bt.rawReply) {
            bt.tabs.switchToTab(bt.rawReply.tab);
          }

          var normalizedUrl = parsFirst.url;
          if (!/^(\/|\.|http|https):/i.test(normalizedUrl)) {
            // default to HTTPS for all cases except the page is from unsecured HTTP
            normalizedUrl = (/^http\b/i.test(location.protocol) ? 'http://' : 'https://') + normalizedUrl;
          }

          var headers = [];
          var bodyNormalized = pars.body;
          if (bodyNormalized) {
            while (/^\s/i.test(bodyNormalized)) {
              var headerValMatch = /^\s+([^\:\s]+)\s*\:\s*(.+)\s*(\n|$)/.exec(bodyNormalized);
              if (headerValMatch) {
                var headerName = headerValMatch[1];
                var headerValue = headerValMatch[2];
                headers.push([headerName, headerValue]);
                bodyNormalized = bodyNormalized.slice(headerValMatch[0].length);
              } else {
                break;
              }
            }
          }

          var verbContinuousTense =
            parsFirst.verb.charAt(0).toUpperCase() + parsFirst.verb.slice(1).toLowerCase();
          verbContinuousTense +=
            (
              // getTing - duplicate last consonant if precedet by vowel
              'eyuioa'.indexOf(verbContinuousTense.charAt(verbContinuousTense.length - 2)) >= 0 &&
                'eyuioa'.indexOf(verbContinuousTense.charAt(verbContinuousTense.length - 1)) < 0 ?
                verbContinuousTense.charAt(verbContinuousTense.length - 1) :
                ''
            ) + 'ing';

          set(getBottomDetails().withSplitter.splitterMainPanel, verbContinuousTense + '...');

          var useProxy = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].indexOf((location.hostname || '').toLowerCase()) >= 0;
          var fetchXHROverride = !useProxy ? fetchXHR : function (normalizedUrl, options) {
            return fetchXHR(
              location.protocol + '//' + location.host + '/xhr',
              {
                method: 'POST',
                body: JSON.stringify({
                  url: normalizedUrl,
                  // headers: options.headers,
                  body: options.body,
                  method: (options.method || 'GET').toUpperCase()
                })
              }
            ).then(function (response) {
              try {
                var responseBody = JSON.parse(response.body);
                if (responseBody.json) responseBody.body = JSON.stringify(responseBody.json, null, 2);
                else responseBody.body = responseBody.text;
                return responseBody;
              } catch (error) {
                return response;
              }
            });
          };

          var withCredentials = false;

          var startTime = getTimeNow();
          var ftc = fetchXHROverride(normalizedUrl, {
            method: parsFirst.verb,
            // @ts-ignore
            withCredentials: withCredentials,
            credentials: 'include',
            headers: /** @type {*} */({ entries: headers }),
            body: parsFirst.verb === 'GET' || !bodyNormalized ? void 0 :
              bodyNormalized
          });
          ftc.then(
            function (response) {
              if (lastSendRequestInstance !== sendRequestInstance) return;

              var replyTime = getTimeNow() - startTime;
              asyncGetTypeScriptLanguageService().then(function (lang) {
                var headers = response.headers;
                /** @type {string} */
                var text = response.body;
                editor.setOption('readOnly', false);

                var bt = getBottomDetailsWithRawReply(lang, text);
                set(bt.withSplitter.splitterMainPanel, 'Done: ' + (replyTime / 1000) + 's.');

                if (!text) {
                  if (bt.structuredReply) {
                    bt.structuredReply.editor.setValue('');
                    if (bt.structuredReply.editor.hasFocus())
                      bt.rawReply.editor.focus();
                  }
                } else {
                  asyncGetTypeScriptLanguageService().then(function (lang) {
                    var bts = getBottomDetailsWithStructuredReply(lang);
                    bts.structuredReply.editor.setValue('PROCESSING  ' + text);

                    if (lastSendRequestInstance !== sendRequestInstance) return;

                    var replyFilename =
                      /^\s*\{/.test(text) && /\}\s*$/.test(text) ? '/reply.json' : '/reply.js';
                    lang.setScriptText(replyFilename, text);

                    var parsedJson = parseJsonLike(text, lang);
                    console.log(parsedJson);

                    try {
                      var fmts = lang.languageService.getFormattingEditsForDocument(replyFilename, {
                        ConvertTabsToSpaces: true,
                        convertTabsToSpaces: true,
                        IndentSize: 2,
                        indentSize: 2,
                        IndentStyle: lang.ts.IndentStyle.Smart,
                        TabSize: 2,
                        tabSize: 2,
                        trimTrailingWhitespace: true,
                        semicolons: lang.ts.SemicolonPreference.Ignore
                      });
                    } catch (tsError) {
                      fmts = [];
                    }

                    var fmtsFromEnd = fmts.slice().sort(function (fmt1, fmt2) {
                      return -(
                        (fmt1.span.start + fmt1.span.length) - (fmt2.span.start + fmt2.span.length) ||
                        fmt1.span.start - fmt2.span.start
                      );
                    });

                    var formattedText = text;
                    var appliedFmts = [];
                    for (var i = 0; i < fmtsFromEnd.length; i++) {
                      var fmt = fmtsFromEnd[i];
                      if (text.slice(fmt.span.start, fmt.span.start + fmt.span.length) === fmt.newText) continue;
                      appliedFmts.push({
                        oldText:
                          text.slice(Math.max(fmt.span.start - 3, 0), fmt.span.start) + ']' +
                          text.slice(fmt.span.start, fmt.span.start + fmt.span.length) +
                          '[' + text.slice(fmt.span.start + fmt.span.length, fmt.span.start + fmt.span.length + 3),
                        ...fmt
                      });
                      formattedText =
                        text.slice(0, fmt.span.start) +
                        fmt.newText +
                        formattedText.slice(fmt.span.start + fmt.span.length);
                    }

                    bts.structuredReply.editor.setValue(formattedText);
                    setTimeout(function () {
                      bts.structuredReply.editor.refresh();
                    }, 100);
                  }
                  );
                }
              });
            },
            function (err) {
              if (lastSendRequestInstance !== sendRequestInstance) return;

              var replyTime = getTimeNow() - startTime;
              editor.setOption('readOnly', false);

              var bt = getBottomDetailsWithRawReply(err.message || String(err));
              set(bt.withSplitter.splitterMainPanel, 'Failed: ' + (replyTime / 1000) + 's.');
              if (bt.structuredReply) {
                bt.structuredReply.editor.setValue('');
                if (bt.structuredReply.editor.hasFocus()) {
                  bt.rawReply.editor.focus();
                }
              }
            }
          );

          return true;
        }
      }

      function bindLayout() {
        var shell = /** @type {HTMLElement} */(document.getElementById('shell'));

        var leftBar = /** @type {HTMLElement} */(document.getElementById('leftBar'));
        var leftTop = /** @type {HTMLElement} */(document.getElementById('leftTop'));
        var leftMiddle = /** @type {HTMLElement} */(document.getElementById('leftMiddle'));
        var leftBottom = /** @type {HTMLElement} */(document.getElementById('leftBottom'));

        var contentPageHost = /** @type {HTMLElement} */(document.getElementById('contentPageHost'));
        var requestEditorHost = /** @type {HTMLElement} */(document.getElementById('requestEditorHost'));

        var pseudoEditor = /** @type {HTMLTextAreaElement} */(document.getElementById('pseudoEditor'));
        var pseudoGutter = /** @type {HTMLElement} */(document.getElementById('pseudoGutter'));

        return {
          shell: shell,
          leftBar: leftBar, leftTop: leftTop, leftMiddle: leftMiddle, leftBottom: leftBottom,
          contentPageHost: contentPageHost,
          requestEditorHost: requestEditorHost,
          pseudoEditor: pseudoEditor,
          pseudoGutter: pseudoGutter,
          allFound:
            !!shell &&
            !!leftBar && !!leftTop && !!leftMiddle && !!leftBottom &&
            !!contentPageHost && !!requestEditorHost &&
            !!pseudoEditor && /textarea/i.test(pseudoEditor.tagName || '') && !!pseudoGutter
        };
      }

      function injectShellHTML() {
        var virt = document.createElement('div');
        virt.innerHTML = embeddedShellLayoutHTML;
        var body = getOrCreateDocumentBody();
        createElements(embeddedShellLayoutHTML, body);
        return bindLayout();
      }

      function injectShellStyles() {
        if (verifyAuthenticStylesPresent()) return;

        var style = document.createElement('style');
        set(style, embeddedMinCSS);
        var head = document.head || document.getElementsByTagName('head')[0];
        if (!head) {
          head = document.createElement('head');
          document.children[0].appendChild(head);
        }
        head.appendChild(style);

        function verifyAuthenticStylesPresent() {
          var allStyles = document.getElementsByTagName('style');
          for (var i = 0; i < allStyles.length; i++) {
            var sty = allStyles[i];
            if ((sty.innerHTML || '').indexOf(embeddedMinCSS_authenticityMarker) >= 0) return true;
          }
        }
      }
    }

    function sanitizeDOM() {
      for (var i = document.body.childNodes.length - 1; i >= 0; i--) {
        var nod = document.body.childNodes.item ? document.body.childNodes.item(i) : document.body.childNodes[i];
        if (!nod) continue;
        switch (nod.nodeType) {
          case 1: // element
            var elem = /** @type {HTMLElement} */(nod);
            // for now, just let script and style only
            if (/^(script|style)$/i.test(elem.tagName || '') || elem.id === 'shell') continue;
            break;

          case 3: // text-node
          case 4: // cdata
            break;
        }

        document.body.removeChild(nod);
      }
    }

    function minimalDependenciesPresent() {
      // @ts-ignore
      return typeof CodeMirror === 'function';
    }

    function isTtyWtf() {
      var detected = typeof location !== 'undefined' && location && /tty/i.test(location.hostname || '');
      return detected;
    }

    function getSplash() {
      var splashText = isTtyWtf() ? embeddedTtyWtfSplashMarkdown_get() : embeddedSplashText;
      return splashText;
    }

    function bootUrlEncoded() {
      if (isTtyWtf()) {
        document.title = applyModifier('tty', 'typewriter') + '.' + applyModifier('WTF', 'box');
      }

      var initialTmod = getTextAndVerbFromUrlEncoded();
      var text = initialTmod.text;
      var verb = initialTmod.verb;

      sanitizeDOM();

      var shellLoader = shell(text, verb);
      if (minimalDependenciesPresent()) {
        complete();
      } else {
        /** @type {*} */(catchREST)['continue'] = function () {
          complete();
        };
      }

      function getTextAndVerbFromUrlEncoded() {
        var enc = detectCurrentUrlEncoded(location);
        if (!enc) {
          var text = isTtyWtf() ? '' : getFunctionCommentContent(function () {/*
post httpbin.org/post
  Content-type: text/html
  Funny: YES!

Send this to test?
        */});

          var verb = 'splash';
        } else {
          var skipVerb = enc.encodedUrl.verbPos < 0 && /^http/i.test(enc.encodedUrl.addr || '');
          if (isPlainTextVerb(enc.encodedUrl.verb))
            skipVerb = true;

          var firstLine =
            skipVerb && !enc.encodedUrl.addr ? '' :
              (skipVerb ? '' : enc.encodedUrl.verb) + (enc.encodedUrl.addr ? (skipVerb ? '' : ' ') + enc.encodedUrl.addr : '');
          var text =
            firstLine +
              (enc.encodedUrl.body ? (firstLine ? '\n' : '') + enc.encodedUrl.body : '');
          var verb = enc.encodedUrl.verb;
        }

        return { text: text, verb: verb };
      }

      /** @param {typeof window.location} location */
      function detectCurrentUrlEncoded(location) {
        if (/http/.test(location.protocol)) {
          var verb = getVerb(location.pathname);
          if (verb) {
            var encodedUrl = parseEncodedURL(location.pathname || '');
            var source = 'pathname';
          } else {
            var encodedUrl = parseEncodedURL(location.search);
            var source = 'search';
          }
        } else {
          var encodedUrl = parseEncodedURL((location.hash || '').replace(/^\#/, ''));
          var source = 'hash';
        }

        if (encodedUrl)
          return {
            encodedUrl: encodedUrl,
            source: source
          };
      }

      function complete() {
        shellLoader.loadingComplete(persistChange);
      }

      /**
       * @param {string | null | undefined} text
       */
      function persistChange(text) {
        var parsed = parseTextRequest(text);

        var enc = detectCurrentUrlEncoded(location);
        var source =
          enc ? enc.source :
            /http/.test(location.protocol || '') ?
              // When comes via HTTP, avoid pathname if "index.html" is present,
              // because it could be static file hosted without 404 or router enabled.
              // Normally web server will be addressed by name, at which point we can rely on those niceties.
              (/\bindex.html\b/i.test(location.pathname || '') ? 'search' : 'pathname') :
              /file/.test(location.protocol || '') ? 'hash' :
                void 0;

        if (typeof history.replaceState !== 'function')
          source = 'hash';
        var slashSeparated = [];
        if (source === 'pathname') {
          // pathname should start with the root, calculate injectLeadPath
          if (enc && enc.encodedUrl && enc.encodedUrl.verbPos > 0) {
            var injectLeadPath =
              location.pathname.slice(0, enc.encodedUrl.verbPos)
                .replace(/^\/+/, '').replace(/\/+$/, '');
            if (injectLeadPath) slashSeparated.push(injectLeadPath);
          } else {
            if (enc && enc.encodedUrl && enc.encodedUrl.addr) {
              var rawVerb = getVerb(location.pathname);
              if (rawVerb) {
                var injectLeadPath =
                  location.pathname.slice(0, rawVerb.index)
                    .replace(/^\/+/, '').replace(/\/+$/, '');
                if (injectLeadPath) slashSeparated.push(injectLeadPath);
              }
            }

            if (!rawVerb) {
              var injectLeadPath = location.pathname.replace(/\/([^\/]+)$/, '/').replace(/^\/+/, '').replace(/\/+$/, '');
              if (injectLeadPath) slashSeparated.push(injectLeadPath);
            }
          }
        }

        var firstLine = parsed && parseFirstLine(parsed.firstLine);
        if (!parsed || !firstLine) {
          slashSeparated.push(
            makeEncodedURL('', '', text ||'')
          );
        } else {
          if (firstLine.verbPos >= 0) slashSeparated.push(makeEncodedURL(firstLine.verb, firstLine.url, parsed.body));
          else slashSeparated.push(makeEncodedURL('', firstLine.url, parsed.body))
        }

        switch (source) {
          case 'pathname':

            history.replaceState(
              null,
              'unused-string',
              location.protocol + '//' + location.host + '/' + slashSeparated.join('/'));
            break;

          case 'search': // update search
            history.replaceState(
              null,
              'unused-string',
              location.protocol + '//' + location.host + '/' + location.pathname.replace(/^\/+/, '').replace(/\/+$/, '') + '?' + slashSeparated.join('/'));
            break;

          case 'hash':
          default: // update hash
            location.hash = slashSeparated.join('/');
            break;
        }
      }
    }

    /**
     * @param {string} uniquenessSource
     */
    function bootBacked(uniquenessSource) {
      // var baseUrl = location && /localhost|(127\.)/i.test(location.hostname) ? './' : 'https://catch.rest/';
      var thisScriptUrl = getThisScriptAddress() || '//catch.rest/index.js';

      var shellLoader = shell('Loading...', 'text');

      loadAsync().then(function (drive) {
        if (minimalDependenciesPresent()) {
          complete();
        } else {
          /** @type {*} */(catchREST)['continue'] = function () {
            docLoadedCheckDependenciesAgain();
          };
          on(window, 'load', complete);
          setTimeout(function () {
            if (document.readyState === 'complete')
              docLoadedCheckDependenciesAgain();
          }, 100);
        }

        if (typeof console !== 'undefined' && console && typeof console.log === 'function')
          console.log('drive loaded ', drive);

        var completed = false;

        function docLoadedCheckDependenciesAgain() {
          if (minimalDependenciesPresent())
            return complete();

          var libScript = document.createElement('script');
          libScript.src = thisScriptUrl.replace(/\/[^\/]+$/, '/lib.js');
          libScript.onload = function () {
            if (minimalDependenciesPresent())
              return complete();
          };
          document.body.appendChild(libScript);
        }

        function complete() {
          if (completed) return;
          completed = true;
          if (/** @type {*} */(catchREST)['continue']) {
            /** @type {*} */(catchREST)['continue'] = function () { };
          }
          off(window, 'load', complete);

          var allFiles = drive.files();
          var bestFile = findBestFile();

          if (bestFile) {
            // HTML comment multifile mode
            var detectMode =
              /\.json$/i.test(bestFile) ? 'json' :
                /\.js$/i.test(bestFile) ? 'javascript' :
                  /\.html$/i.test(bestFile) ? 'html' :
                    /\.md$/i.test(bestFile) ? 'markdown' :
                      'text';

            shellLoader.loadingComplete(
              function (updatedText) {
                drive.write(bestFile, updatedText);
              },
              drive.read(bestFile),
              detectMode
            );

          } else {
            // Markdown or plain text mode
            var combined = [];
            for (var i = document.body.childNodes.length - 1; i >= 0; i--) {
              var nod = document.body.childNodes[i] || document.body.childNodes.item(i);
              switch (nod.nodeType) {
                case 1: // element
                  var elem = /** @type {HTMLElement} */(nod);
                  if (!elem.tagName || ['SCRIPT', 'STYLE', 'LINK'].indexOf(elem.tagName.toUpperCase()) >= 0) continue;
                  if (elem.id === 'shell') continue;
                  combined.push(elem.outerHTML);
                  break;

                case 3: // text
                case 4: // CDATA
                // case 8: // comment
                  var textContent = nod.textContent || nod.nodeValue || /** @type {*} */(nod).innerText;
                  if (textContent) combined.push(textContent);
                  break;
              }
            }

            shellLoader.loadingComplete(
              function (updatedText) {
                drive.write('/index.md', updatedText);
              },
              combined.join('\n').replace(/^\s+/, ''),
              'markdown'
            );
          }

          function findBestFile() {
            var bestFile =
              allFiles.filter(function (f) { return /index\.js/i.test(f); })[0] ||
              allFiles.filter(function (f) { return /index\.html/i.test(f); })[0] ||
              allFiles.filter(function (f) { return /README/i.test(f); })[0] ||
              allFiles[0];

            return bestFile;
          }
        }
      });

      function getThisScriptAddress() {
        for (var i = document.scripts.length - 1; i >= 0; i--) {
          var scr = document.scripts[i];
          if (scr.src && /\/index.js$/i.test(scr.src)) {
            return scr.src;
          }
        }

        var scriptElements = document.getElementsByTagName('script');
        for (var i = scriptElements.length - 1; i >= 0; i--) {
          var scr = scriptElements[i];
          if (scr.src && /\/index.js$/i.test(scr.src)) {
            return scr.src;
          }
        }
      }

      /**
       * @param {((progress: { loadedSize: number, anticipatedTotalSize: number | undefined, fileCount: number }) => void)=} progressCallback
       * @returns {Promise<Drive.Detached.DOMDrive>}
       */
      function loadAsync(progressCallback) {
        return new Promise(function (resolve, reject) {
          var persist = persistence(document, uniquenessSource);

          var reportedSize = persist.domLoadedSize;
          var reportedTotalSize = persist.domTotalSize;
          var continueLoadingTimeout;
          continueLoading();

          function continueLoading() {
            if (document.readyState === 'complete')
              return persist.finishParsing(function(drive) {
                resolve(drive);
              });

            if (typeof progressCallback === 'function') {
              if ((persist.domLoadedSize || 0) > (reportedSize || 0) ||
                (persist.domTotalSize || 0) > (reportedTotalSize || 0)) {
                progressCallback({
                  loadedSize: persist.domLoadedSize || 0,
                  anticipatedTotalSize: persist.domTotalSize,
                  fileCount: persist.loadedFileCount || 0
                });
              }

              reportedSize = persist.domLoadedSize;
              reportedTotalSize = persist.domTotalSize;
            }
            continueLoadingTimeout = setTimeout(continueLoading, 400)
          }
        });

      }
    }

    /**
     * Booting from inside browser, one of possible 3 options/modes:
     * 1. URLENCODED (including empty URL)
     *    - local HTML will be discarded
     *    - content decoded/extracted from URL
     *    - presentation UI/verb taken from URL
     *    - auto-detection of verb from content?
     *    - support "attachments"
     *    - special case of empty: show splash
     * 2. BACKED
     *    - content is extracted from HTML body
     *    - formats to support (MIME multipart? comment-file? CSV? Markdown?)
     *    - changes loaded from storage (webSQL, indexedDB, localStorage) and applied on top
     *    - auto-detection of verb from content?
     *    - for multi-file, which one is default?
     */
    function boot() {
      // @ts-ignore
      if (typeof catchREST_urlencoded !== 'undefined' && catchREST_urlencoded) {
        bootUrlEncoded();
      } else {
        bootBacked(location.pathname);
      }
    }

    boot();
  }

  function runAsWScript() {
    // TODO: fire mshta
  }

  function detectEnvironment() {
    if (typeof window !== 'undefined' && window && /**@type{*}*/(window.alert)
      && typeof document !== 'undefined' && document && /**@type{*}*/(document.createElement))
      return 'browser';

    // TODO: detect worker in browser

    if (typeof process !== 'undefined' && process && process.argv && typeof process.argv.length === 'number'
      && typeof require === 'function' && typeof require.resolve === 'function'
      && typeof module !== 'undefined' && module)
      if ((process.mainModule || require.main) === module)
        return 'node-script';
      else
        return 'node-module';

    if (typeof WScript !== 'undefined' && WScript && !!WScript.ScriptFullName) return 'wscript';

    // TODO: detect apple script inside shell?
  }

  function detectEnvironmentAndStart() {
    switch (detectEnvironment()) {
      case 'node-script': return runAsNode();
      case 'node-module': return runAsNode(module);
      case 'browser': return runAsBrowser();
      case 'wscript': return runAsWScript();
    }

    // TODO: stick sdome exports on 'this' and exit?
    throw new Error('Environment was not recognised.');
  }

  // re-entering will be diverted (and can be overridden by whatever is actually running)
  if (/** @type {*} */(catchREST)['continue']) return /** @type {*} */(catchREST)['continue']();
  /** @type {*} */(catchREST)['continue'] = function () { };

  detectEnvironmentAndStart();
} catchREST();
// </script>
