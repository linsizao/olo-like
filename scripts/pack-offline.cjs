const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build/web-mobile');
const read = name => fs.readFileSync(path.join(build, name), 'utf8');
const extensions = { js: 'text/javascript', json: 'application/json', bin: 'application/octet-stream', png: 'image/png' };
const resources = {};
function collect(dir) {
  for (const entry of fs.readdirSync(path.join(build, dir), { withFileTypes: true })) {
    const key = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) { collect(key); continue; }
    const type = extensions[path.extname(key).slice(1)];
    if (type) resources[key] = 'data:' + type + ';base64,' + fs.readFileSync(path.join(build, key)).toString('base64');
  }
}
collect('');
const shim = `(() => {
  const files = ${JSON.stringify(resources)};
  const root = new URL('./', document.baseURI);
  function resource(url) {
    const absolute = new URL(url, root);
    absolute.search = ''; absolute.hash = '';
    return absolute.href.startsWith(root.href) ? files[decodeURIComponent(absolute.href.slice(root.href.length))] : undefined;
  }
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...options) { return open.call(this, method, resource(url) || url, ...options); };
  const fetchFile = window.fetch.bind(window);
  window.fetch = (input, options) => fetchFile(resource(input.url || input) || input, options);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  Object.defineProperty(HTMLScriptElement.prototype, 'src', { ...descriptor, set(url) { descriptor.set.call(this, resource(url) || url); } });
})();`;
const inline = source => '<script>' + source.replace(/<\/script/gi, '<\\/script') + '</script>';
const { name } = require('../package.json');
let html = read('index.html').replace(/<title>.*?<\/title>/, `<title>${name} · 本地双人</title>`)
  .replace(/<link[^>]*href="style\.css"[^>]*>/, () => '<style>' + read('style.css') + 'body{background:#fff}</style>' + inline(shim))
  .replace(/<script src="src\/import-map.json"[^>]*>\s*<\/script>/, () => '<script type="systemjs-importmap">' + read('src/import-map.json').replace(/\.\.\/cocos-js/g, 'cocos-js') + '</script>')
  .replace(/<script src="(src\/[^"]+\.js)"[^>]*>\s*<\/script>/g, (_, name) => inline(read(name)));
fs.writeFileSync(path.join(root, 'offline.html'), html);
