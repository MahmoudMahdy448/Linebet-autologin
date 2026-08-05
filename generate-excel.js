import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const PHONE_PATTERN = /^01\d{9}$/;
const FILENAME_PATTERN = /(01\d{9})/;

function isValidPhone(value) {
  return typeof value === 'string' && PHONE_PATTERN.test(value);
}

const numbersJsonPath = path.resolve(process.cwd(), 'extracted_numbers.json');
const screenshotsDir = path.resolve(process.cwd(), 'screenshots');

const numbers = new Set();

if (existsSync(numbersJsonPath)) {
  const parsed = JSON.parse(readFileSync(numbersJsonPath, 'utf8'));
  for (const entry of parsed) {
    if (isValidPhone(entry)) {
      numbers.add(entry);
    }
  }
}

if (numbers.size === 0 && existsSync(screenshotsDir)) {
  const files = readdirSync(screenshotsDir);
  for (const file of files) {
    const match = file.match(FILENAME_PATTERN);
    if (match && isValidPhone(match[1])) {
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
try {
  XLSX.writeFile(wb, 'extracted_numbers.xlsx');
  console.log(`Extracted ${unique.length} unique phone number(s) to extracted_numbers.xlsx`);
} catch (e) {
  if (e.code === 'EBUSY') {
    console.log('File is open in another program. Close it and try again.');
  } else {
    throw e;
  }
}
