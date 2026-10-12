/**
 * 分析 CSS 文件中的硬编码问题
 * 输出：颜色、border-radius、!important 统计
 */

const fs = require('fs');
const path = require('path');

// 要分析的 CSS 文件
const cssFiles = [
  'styles.css',
  'desktop-shell.css',
  'canvas-bendo.css',
  'canvas-agent.css',
  'system-settings.css',
  'canvas-asset-library.css',
  'canvas-collab.css',
  'canvas-director3d.css',
];

// 正则表达式
const patterns = {
  hexColor: /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g,
  rgbColor: /rgba?\([^)]+\)/g,
  hslColor: /hsla?\([^)]+\)/g,
  borderRadius: /border-radius\s*:\s*[^;]+;/g,
  important: /!important/g,
};

// 颜色映射建议
const colorMappings = {
  '#000': 'var(--neon-background)',
  '#000000': 'var(--neon-background)',
  '#0a0a0a': 'var(--neon-background)',
  '#fff': 'var(--neon-foreground)',
  '#ffffff': 'var(--neon-foreground)',
  '#1a1a1a': 'var(--neon-card)',
  '#00ff41': 'var(--neon-primary)',
  '#00ff00': 'var(--neon-primary)',
  '#0f0': 'var(--neon-primary)',
  '#ff0033': 'var(--neon-destructive)',
  '#f00': 'var(--neon-destructive)',
  '#ff0000': 'var(--neon-destructive)',
  '#2a2a2a': 'var(--neon-border)',
  '#262626': 'var(--neon-border)',
  '#555': 'var(--neon-muted)',
  '#555555': 'var(--neon-muted)',
};

function analyzeFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  文件不存在: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  // 统计各类问题
  const hexColors = content.match(patterns.hexColor) || [];
  const rgbColors = content.match(patterns.rgbColor) || [];
  const hslColors = content.match(patterns.hslColor) || [];
  const borderRadii = content.match(patterns.borderRadius) || [];
  const importants = content.match(patterns.important) || [];
  
  const totalColors = hexColors.length + rgbColors.length + hslColors.length;
  
  // 统计唯一颜色
  const uniqueColors = new Set([
    ...hexColors.map(c => c.toLowerCase()),
    ...rgbColors.map(c => c.toLowerCase()),
    ...hslColors.map(c => c.toLowerCase()),
  ]);
  
  return {
    fileName,
    fileSize: (content.length / 1024).toFixed(2) + ' KB',
    totalColors,
    uniqueColors: uniqueColors.size,
    hexColors: hexColors.length,
    rgbColors: rgbColors.length,
    hslColors: hslColors.length,
    borderRadii: borderRadii.length,
    importants: importants.length,
    topColors: getTopColors(hexColors, rgbColors, hslColors),
  };
}

function getTopColors(hex, rgb, hsl) {
  const colorCount = {};
  
  [...hex, ...rgb, ...hsl].forEach(color => {
    const normalized = color.toLowerCase();
    colorCount[normalized] = (colorCount[normalized] || 0) + 1;
  });
  
  return Object.entries(colorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([color, count]) => ({
      color,
      count,
      suggestion: colorMappings[color] || '需要手动映射',
    }));
}

function generateReport() {
  console.log('');
  console.log('='.repeat(80));
  console.log('  AI OS 硬编码分析报告');
  console.log('='.repeat(80));
  console.log('');
  
  const results = [];
  let totalIssues = 0;
  
  cssFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    const result = analyzeFile(filePath);
    
    if (result) {
      results.push(result);
      totalIssues += result.totalColors + result.borderRadii + result.importants;
    }
  });
  
  // 总览
  console.log('📊 总体统计');
  console.log('-'.repeat(80));
  console.log(`总文件数: ${results.length}`);
  console.log(`总问题数: ${totalIssues}`);
  console.log('');
  
  // 各文件详情
  console.log('📁 文件详情');
  console.log('-'.repeat(80));
  
  results.forEach(result => {
    console.log(`\n文件: ${result.fileName}`);
    console.log(`  大小: ${result.fileSize}`);
    console.log(`  颜色总数: ${result.totalColors} (唯一: ${result.uniqueColors})`);
    console.log(`    - 十六进制: ${result.hexColors}`);
    console.log(`    - RGB/RGBA: ${result.rgbColors}`);
    console.log(`    - HSL/HSLA: ${result.hslColors}`);
    console.log(`  border-radius: ${result.borderRadii}`);
    console.log(`  !important: ${result.importants}`);
    
    if (result.topColors.length > 0) {
      console.log(`\n  🎨 高频颜色 (Top ${Math.min(5, result.topColors.length)}):`);
      result.topColors.slice(0, 5).forEach(({ color, count, suggestion }) => {
        console.log(`    ${color.padEnd(25)} × ${count.toString().padStart(4)}  →  ${suggestion}`);
      });
    }
  });
  
  // 优先级建议
  console.log('\n');
  console.log('🎯 迁移优先级建议');
  console.log('-'.repeat(80));
  
  const prioritized = results
    .map(r => ({
      ...r,
      score: r.totalColors * 2 + r.importants * 1.5 + r.borderRadii,
    }))
    .sort((a, b) => b.score - a.score);
  
  prioritized.forEach((result, index) => {
    const priority = index < 3 ? '🔴 HIGH' : index < 6 ? '🟡 MEDIUM' : '🟢 LOW';
    console.log(`${priority.padEnd(12)} ${result.fileName.padEnd(30)} (得分: ${result.score.toFixed(0)})`);
  });
  
  console.log('\n');
  console.log('='.repeat(80));
  console.log('  报告生成完成');
  console.log('='.repeat(80));
  console.log('');
}

// 运行分析
generateReport();
