#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith('.jsx')) files.push(p);
  }
  return files;
}

for (const file of walk('views').concat(walk('components')).concat(walk('context'))) {
  let content = readFileSync(file, 'utf8');
  // Fix mixed quotes from broken migration
  content = content.replace(/from "react'/g, 'from "react"');
  content = content.replace(/from '@\/([^'"]+)"/g, "from '@/$1'");
  content = content.replace(/from '@\/([^'"]+)'/g, "from '@/$1'");
  content = content.replace(/from "@\/([^'"]+)"/g, "from '@/$1'");
  writeFileSync(file, content);
}

console.log('Quote fixes done');
