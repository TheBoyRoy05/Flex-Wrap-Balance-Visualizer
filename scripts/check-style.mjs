#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Recursively walk directory and collect files matching extensions.
 */
function walkDir(dir, extensions) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(projectRoot, fullPath);

    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(relPath);
    }
  }

  return files;
}

// Design system constraints
const ALLOWED_FONT_SIZES = new Set([13, 15, 17, 21, 28, 40]);
const ALLOWED_BORDER_RADIUS = new Set([6, 8, 10]);
const ALLOWED_SPACING = new Set([0, 4, 8, 12, 16, 24, 32, 48, 64]);

// Properties that use spacing scale
const SPACING_PROPS = ['padding', 'margin', 'gap', 'row-gap', 'column-gap'];

const violations = [];

/**
 * Check if a value contains dynamic expressions that should be skipped.
 * Returns true if the value should NOT be checked.
 */
function isDynamic(value) {
  return /var\(|calc\(|{.*}/.test(value);
}

/**
 * Extract hex color from a value string.
 * Returns the hex color or null if not found.
 */
function extractHexColor(value) {
  const match = value.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?(?![0-9a-fA-F])/);
  return match ? match[0] : null;
}

/**
 * Extract function-form colors (rgba, rgb, hsl) from a value string.
 * Returns array of {type, text} objects found in the string.
 */
function extractFunctionColors(value) {
  const results = [];
  const regex = /(rgba|rgb|hsl)\s*\([^)]*\)/g;
  let match;
  while ((match = regex.exec(value)) !== null) {
    results.push({
      type: match[1],
      text: match[0],
    });
  }
  return results;
}

/**
 * Check if a value is 0 or 0px (always allowed).
 */
function isZeroValue(value) {
  return value === '0' || value === '0px';
}

/**
 * Check if a value is 1px (hairline border, always allowed).
 */
function isHairline(value) {
  return value === '1px';
}

/**
 * Check if a value is 50% or 9999px (pill shapes, allowed for border-radius).
 */
function isPillBorderRadius(value) {
  return value === '50%' || value === '9999px';
}

/**
 * Extract px values from a CSS value string.
 * Returns array of {value, match} objects found in the string.
 */
function extractPxValues(value) {
  const results = [];
  const regex = /([0-9.]+)px/g;
  let match;
  while ((match = regex.exec(value)) !== null) {
    results.push({
      value: `${match[1]}px`,
      numeric: parseFloat(match[1]),
      fullMatch: match[0],
    });
  }
  return results;
}

/**
 * Check a font-size property value.
 */
function checkFontSize(value, lineNum, filePath) {
  if (isDynamic(value)) return;

  const pxValues = extractPxValues(value);
  pxValues.forEach(({ numeric, fullMatch }) => {
    if (!ALLOWED_FONT_SIZES.has(numeric)) {
      violations.push({
        file: filePath,
        line: lineNum,
        text: fullMatch,
        type: 'font-size',
        value: numeric,
        allowed: Array.from(ALLOWED_FONT_SIZES).sort((a, b) => a - b),
      });
    }
  });
}

/**
 * Check a border-radius property value.
 */
function checkBorderRadius(value, lineNum, filePath) {
  if (isDynamic(value)) return;

  // Skip pill shapes
  if (isPillBorderRadius(value)) return;

  const pxValues = extractPxValues(value);
  pxValues.forEach(({ numeric, fullMatch }) => {
    if (!ALLOWED_BORDER_RADIUS.has(numeric)) {
      violations.push({
        file: filePath,
        line: lineNum,
        text: fullMatch,
        type: 'border-radius',
        value: numeric,
        allowed: Array.from(ALLOWED_BORDER_RADIUS).sort((a, b) => a - b),
      });
    }
  });
}

/**
 * Check a spacing property (padding, margin, gap, etc.).
 */
function checkSpacing(prop, value, lineNum, filePath) {
  if (isDynamic(value)) return;

  const pxValues = extractPxValues(value);
  pxValues.forEach(({ numeric, fullMatch }) => {
    if (!isZeroValue(fullMatch) && !ALLOWED_SPACING.has(numeric)) {
      violations.push({
        file: filePath,
        line: lineNum,
        text: fullMatch,
        type: prop,
        value: numeric,
        allowed: Array.from(ALLOWED_SPACING).sort((a, b) => a - b),
      });
    }
  });
}

/**
 * Check a color value for raw hex and function-form color literals (outside :root).
 */
function checkColor(value, lineNum, filePath, inRootBlock) {
  if (inRootBlock) return; // Skip colors inside :root

  const hex = extractHexColor(value);
  if (hex) {
    violations.push({
      file: filePath,
      line: lineNum,
      text: hex,
      type: 'color',
      reason: 'Use design tokens (--text, --accent, etc.) instead of raw hex',
    });
  }

  const functionColors = extractFunctionColors(value);
  functionColors.forEach(({ type, text }) => {
    violations.push({
      file: filePath,
      line: lineNum,
      text: text,
      type: 'color',
      reason: `Use design tokens (--text, --accent, etc.) instead of raw ${type}()`,
    });
  });
}

/**
 * Parse CSS from a string and check rules.
 * For app.css, track if we're inside :root block to skip color checks there.
 */
function checkCssBlock(css, filePath) {
  const lines = css.split('\n');
  let lineNum = 1;
  let inRootBlock = false;
  let braceDepth = 0;

  for (const line of lines) {
    // Track :root block boundaries
    if (line.includes(':root')) {
      inRootBlock = true;
      braceDepth = 0;
    }

    // Count braces to track when we exit :root
    for (const char of line) {
      if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
        if (inRootBlock && braceDepth === 0) {
          inRootBlock = false;
        }
      }
    }

    // Parse property: value pairs
    // Look for lines that contain a colon (property declarations)
    const colonMatch = line.match(/^\s*([a-z-]+)\s*:\s*([^;]*);/);
    if (colonMatch) {
      const prop = colonMatch[1];
      const value = colonMatch[2].trim();

      if (prop === 'font-size') {
        checkFontSize(value, lineNum, filePath);
      } else if (prop === 'border-radius') {
        checkBorderRadius(value, lineNum, filePath);
      } else if (SPACING_PROPS.includes(prop)) {
        checkSpacing(prop, value, lineNum, filePath);
      } else if (prop === 'color' || prop === 'background' || prop === 'border-color' || prop === 'box-shadow') {
        checkColor(value, lineNum, filePath, inRootBlock);
      }
    }

    lineNum++;
  }
}

/**
 * Extract and check <style> block from a Svelte component.
 */
function checkSvelteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract <style> block
  const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) return;

  const styleBlock = styleMatch[1];
  const styleStartLine = content.substring(0, styleMatch.index).split('\n').length;

  // Check the style block
  const styleLines = styleBlock.split('\n');
  let globalLineNum = styleStartLine;

  let inRootBlock = false;
  let braceDepth = 0;

  for (const line of styleLines) {
    // Track :root block (shouldn't exist in Svelte but be safe)
    if (line.includes(':root')) {
      inRootBlock = true;
      braceDepth = 0;
    }

    for (const char of line) {
      if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
        if (inRootBlock && braceDepth === 0) {
          inRootBlock = false;
        }
      }
    }

    // Parse property declarations
    const colonMatch = line.match(/^\s*([a-z-]+)\s*:\s*([^;]*);/);
    if (colonMatch) {
      const prop = colonMatch[1];
      const value = colonMatch[2].trim();

      if (prop === 'font-size') {
        checkFontSize(value, globalLineNum, filePath);
      } else if (prop === 'border-radius') {
        checkBorderRadius(value, globalLineNum, filePath);
      } else if (SPACING_PROPS.includes(prop)) {
        checkSpacing(prop, value, globalLineNum, filePath);
      } else if (prop === 'color' || prop === 'background' || prop === 'border-color' || prop === 'box-shadow') {
        checkColor(value, globalLineNum, filePath, inRootBlock);
      }
    }

    globalLineNum++;
  }
}

/**
 * Main entry point.
 */
function main() {
  const srcDir = path.join(projectRoot, 'src');

  // Find all CSS and Svelte files
  const cssFiles = walkDir(srcDir, ['.css']);
  const svelteFiles = walkDir(srcDir, ['.svelte']);

  // Check CSS files
  for (const file of cssFiles) {
    const filePath = path.join(projectRoot, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    checkCssBlock(content, file);
  }

  // Check Svelte files
  for (const file of svelteFiles) {
    const filePath = path.join(projectRoot, file);
    checkSvelteFile(filePath);
  }

  // Report results
  if (violations.length === 0) {
    console.log('✓ No style violations found.');
    process.exit(0);
  }

  violations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  violations.forEach((v) => {
    console.log(`${v.file}:${v.line} ${v.text}`);
  });

  console.log(`\n✗ Found ${violations.length} style violation${violations.length === 1 ? '' : 's'}.`);
  process.exit(1);
}

main();
