import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const numbersJsonPath = path.resolve(process.cwd(), 'extracted_numbers.json');
const screenshotsDir = path.resolve(process.cwd(), 'screenshots');

const numbers = new Set();

if (existsSync(numbersJsonPath)) {
  JSON.parse(readFileSync(numbersJsonPath, 'utf8')).forEach((n) => numbers.add(n));
}

if (existsSync(screenshotsDir)) {
  const files = readdirSync(screenshotsDir);
  for (const file of files) {
    const match = file.match(/(01\d{9})/);
    if (match) {
      numbers.add(match[1]);
    }
  }
}

if (!numbers.size) {
  console.log('No data found. Run "npm run login" first.');
  process.exit(1);
}

const unique = [...numbers];
const wb = XLSX.utils.book_new();
const data = unique.map((num) => ({ Phone: num }));
const ws = XLSX.utils.json_to_sheet(data);
XLSX.utils.book_append_sheet(wb, ws, 'Phone Numbers');
XLSX.writeFile(wb, 'extracted_numbers.xlsx');

console.log(`Extracted ${unique.length} unique phone number(s) to extracted_numbers.xlsx`);
