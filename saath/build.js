#!/usr/bin/env node
// Inlines src/app.css and src/app.js into src/page.html → dist/index.html (single-file page).
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const out = src('page.html').replace('/*APP_CSS*/', () => src('app.css')).replace('//APP_JS', () => src('app.js'));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), out);
console.log('dist/index.html', (out.length / 1024).toFixed(1) + ' KB');
