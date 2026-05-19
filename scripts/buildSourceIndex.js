#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const SOURCE_DIR = 'source';          // 存放各个源 JSON 文件的目录
const OUTPUT_FILE = 'Index.json';     // 输出的索引文件
// =========================

/**
 * 检查源是否需要验证
 * @param {object} config 源配置对象（从 JSON 解析）
 * @returns {boolean}
 */
function needVerify(config) {
  const verify = config?.expansionConfig?.verifyConfig;
  if (!verify) return false;
  const selector = verify.selectorVerify;
  return selector && typeof selector === 'string' && selector.trim().length > 0;
}

/**
 * 提取单个源的索引信息
 * @param {string} filePath 源文件的绝对路径
 * @param {string} relativePath 相对于项目根目录的路径（含 .json）
 * @returns {object|null}
 */
function extractSourceInfo(filePath, relativePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`❌ 读取文件失败: ${filePath}`, err.message);
    return null;
  }

  let config;
  try {
    config = JSON.parse(content);
  } catch (err) {
    console.error(`❌ JSON 解析失败: ${filePath}`, err.message);
    return null;
  }

  // 必须字段检查
  const name = config?.config?.name;
  const version = config?.version;
  if (!name || !version) {
    console.warn(`⚠️ 跳过 ${filePath}：缺少 name 或 version 字段`);
    return null;
  }

  const stat = fs.statSync(filePath);
  const pathWithoutExt = relativePath.replace(/\.json$/, '');

  return {
    name: name,
    version: version,
    lastUpdate: stat.mtimeMs,        // 文件修改时间戳（毫秒）
    needVerify: needVerify(config),
    path: pathWithoutExt             // 例如 "source/source1"
  };
}

/**
 * 扫描 source 目录，构建索引数组（直接返回数组）
 */
function buildIndexArray() {
  const sourceDir = path.resolve(process.cwd(), SOURCE_DIR);
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ 源目录不存在: ${sourceDir}`);
    return null;
  }

  const files = fs.readdirSync(sourceDir);
  const sources = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const absolutePath = path.join(sourceDir, file);
    const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
    const info = extractSourceInfo(absolutePath, relativePath);
    if (info) {
      sources.push(info);
    }
  }

  // 按 name 排序（可选）
  sources.sort((a, b) => a.name.localeCompare(b.name));

  return sources;   // 直接返回数组
}

function main() {
  const indexArray = buildIndexArray();
  if (!indexArray) process.exit(1);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(indexArray, null, 2), 'utf-8');
  console.log(`✅ ${OUTPUT_FILE} 已生成，共 ${indexArray.length} 个源`);
}

main();