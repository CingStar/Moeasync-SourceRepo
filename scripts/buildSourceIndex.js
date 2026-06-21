#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const SOURCE_DIR = 'source';          // 源文件目录
const OUTPUT_FILE = 'Index.json';     // 输出索引文件
// =========================

/**
 * 判断源是否需要验证
 * @param {object} source 单个源对象
 * @returns {boolean}
 */
function needVerify(source) {
  const verify = source?.config?.expansionConfig?.subjectConfig?.selectorVerify;
  if (!verify) return false;
  const selector = verify;
  return selector && typeof selector === 'string' && selector.trim().length > 0;
}

/**
 * 从单个源文件中提取所有源的索引项
 * @param {string} filePath 相对于仓库根目录的路径（例如 "source/合集.json"）
 * @returns {Array} 索引项数组
 */
function extractItemsFromFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`⚠️ 文件不存在，跳过: ${filePath}`);
    return [];
  }

  let content;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch (err) {
    console.error(`❌ 读取文件失败: ${filePath}`, err.message);
    return [];
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error(`❌ JSON 解析失败: ${filePath}`, err.message);
    return [];
  }

  const animeSources = data?.sourceList?.animeSources;
  if (!Array.isArray(animeSources)) {
    console.warn(`⚠️ 跳过 ${filePath}：缺少 sourceList.animeSources 数组`);
    return [];
  }

  // 获取文件的最后修改时间（毫秒时间戳）
  const stat = fs.statSync(absolutePath);
  const lastUpdate = stat.mtimeMs;
  const basePath = filePath.replace(/\.json$/, ''); // 例如 "source/合集"

  const items = [];
  for (let i = 0; i < animeSources.length; i++) {
    const src = animeSources[i];
    const name = src?.config?.name;
    const version = src?.version;
    const coverUrl = src?.config?.iconUrl;
    if (!name || !version) {
      console.warn(`⚠️ 跳过 ${filePath} 中的第 ${i+1} 个源：缺少 name 或 version`);
      continue;
    }
    items.push({
      name: name,
      version: version,
      lastUpdate: lastUpdate,        // 文件修改时间戳（毫秒）
      needVerify: needVerify(src),
      path: basePath,
      cover: coverUrl
    });
  }
  return items;
}

/**
 * 加载现有的 index.json 文件（如果存在）
 * @returns {Array}
 */
function loadExistingIndex() {
  if (!fs.existsSync(OUTPUT_FILE)) return [];
  try {
    const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`⚠️ 读取现有 ${OUTPUT_FILE} 失败，将重新生成`, err.message);
    return [];
  }
}

/**
 * 保存索引数组到文件
 * @param {Array} indexArray
 */
function saveIndex(indexArray) {
  // 可选：按 name 排序
  indexArray.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(indexArray, null, 2), 'utf-8');
  console.log(`✅ ${OUTPUT_FILE} 已更新，共 ${indexArray.length} 个源`);
}

/**
 * 增量更新索引
 * @param {string[]} changedFiles 变更的文件列表（相对于仓库根目录）
 */
function incrementalUpdate(changedFiles) {
  const existing = loadExistingIndex();
  // 构建一个 Map：key = path，value = 该 path 下的所有条目数组
  const pathToEntries = new Map();
  for (const entry of existing) {
    const p = entry.path;
    if (!pathToEntries.has(p)) pathToEntries.set(p, []);
    pathToEntries.get(p).push(entry);
  }

  for (const file of changedFiles) {
    // 忽略非源文件（安全性检查）
    if (!file.startsWith(SOURCE_DIR) || !file.endsWith('.json')) continue;

    const basePath = file.replace(/\.json$/, '');
    // 删除该 path 对应的所有旧条目
    pathToEntries.delete(basePath);

    // 如果文件仍然存在（不是删除操作），则重新读取并添加
    const absolutePath = path.resolve(process.cwd(), file);
    if (fs.existsSync(absolutePath)) {
      const newItems = extractItemsFromFile(file);
      if (newItems.length > 0) {
        pathToEntries.set(basePath, newItems);
      }
    }
  }

  // 将 Map 展平为数组
  const newIndex = [];
  for (const entries of pathToEntries.values()) {
    newIndex.push(...entries);
  }
  saveIndex(newIndex);
}

/**
 * 全量重建索引（首次运行或未提供变更列表时）
 */
function fullRebuild() {
  const sourceDir = path.resolve(process.cwd(), SOURCE_DIR);
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ 源目录不存在: ${sourceDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
  const allItems = [];
  for (const file of files) {
    const relPath = path.join(SOURCE_DIR, file).replace(/\\/g, '/');
    const items = extractItemsFromFile(relPath);
    allItems.push(...items);
  }
  saveIndex(allItems);
}

function main() {
  // 获取变更文件列表：可以从命令行参数或环境变量 CHANGED_FILES 获取
  let changedFiles = [];
  const args = process.argv.slice(2);
  if (args.length >= 2 && args[0] === '--changed-files') {
    changedFiles = args.slice(1);
  } else if (process.env.CHANGED_FILES) {
    changedFiles = process.env.CHANGED_FILES.split(/\s+/).filter(f => f);
  }

  if (changedFiles.length === 0) {
    console.log('未提供变更文件列表，执行全量重建...');
    fullRebuild();
  } else {
    console.log('增量更新，变更文件:', changedFiles);
    incrementalUpdate(changedFiles);
  }
}

main();