const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const exe = process.env.COCOS_CREATOR || [
  '/Applications/Cocos/Creator/3.8.6/CocosCreator.app/Contents/MacOS/CocosCreator',
  path.join(os.homedir(), 'Library/Caches/olo-mini/3.8.6/CocosCreator.app/Contents/MacOS/CocosCreator')
].find(file => fs.existsSync(file));
if (!exe) throw Error('请通过 COCOS_CREATOR 指定 Cocos Creator 3.8.6 可执行文件。');
for (const options of ['platform=web-mobile;mainBundleCompressionType=merge_dep', 'configPath=' + path.join(root, 'scripts/wechat-build.json')]) {
  const run = spawnSync(exe, ['--project', root, '--build', options], { cwd: root, stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 36) throw Error('Creator 构建失败：' + run.status);
}
require('./pack-offline.cjs');
fs.cpSync(path.join(root, 'build/wechatgame'), path.join(root, 'wechat'), { recursive: true });
