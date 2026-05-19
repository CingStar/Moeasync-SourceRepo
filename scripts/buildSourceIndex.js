#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const SOURCE_DIR = 'source';          // 存放源文件的目录
const OUTPUT_FILE = 'Index.json';     // 输出的索引文件
// =========================

/**
 * 判断源是否需要验证
 * @param {object} source 单个源对象（来自 animeSources 数组中的一项）
 * @returns {boolean}
 */
function needVerify(source) {
  const verify = source?.config?.expansionConfig?.verifyConfig;
  if (!verify) return false;
  const selector = verify.selectorVerify;
  return selector && typeof selector === 'string' && selector.trim().length > 0;
}

/**
 * 从单个源文件中提取所有源的索引项
 * @param {string} filePath 文件绝对路径
 * @param {string} relativePath 相对于项目根目录的路径（含 .json）
 * @returns {Array} 索引项数组
 */
function extractSourcesFromFile(filePath, relativePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
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
    console.warn(`⚠️ 跳过 ${relativePath}：缺少 sourceList.animeSources 数组`);
    return [];
  }

  const stat = fs.statSync(filePath);
  const fileMtime = stat.mtimeMs;
  // path 字段：去掉 .json 扩展名的相对路径，例如 "source/稀饭动漫"
  const basePath = relativePath.replace(/\.json$/, '');

  const items = [];
  for (let i = 0; i < animeSources.length; i++) {
    const src = animeSources[i];
    const name = src?.config?.name;
    const version = src?.version;
    if (!name || !version) {
      console.warn(`⚠️ 跳过 ${relativePath} 中的第 ${i+1} 个源：缺少 name 或 version`);
      continue;
    }

    items.push({
      name: name,
      version: version,
      lastUpdate: fileMtime,          // 该源文件的修改时间戳
      needVerify: needVerify(src),
      path: basePath                   // 指向源文件本身
    });
  }

  return items;
}

/**
 * 扫描 source 目录，构建索引数组
 */
function buildIndexArray() {
  const sourceDir = path.resolve(process.cwd(), SOURCE_DIR);
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ 源目录不存在: ${sourceDir}`);
    return null;
  }

  const files = fs.readdirSync(sourceDir);
  const allItems = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const absolutePath = path.join(sourceDir, file);
    const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
    const items = extractSourcesFromFile(absolutePath, relativePath);
    allItems.push(...items);
  }

  // 可选：按 name 排序
  allItems.sort((a, b) => a.name.localeCompare(b.name));

  return allItems;
}

function main() {
  const indexArray = buildIndexArray();
  if (!indexArray) process.exit(1);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(indexArray, null, 2), 'utf-8');
  console.log(`✅ ${OUTPUT_FILE} 已生成，共 ${indexArray.length} 个源`);
}

main();