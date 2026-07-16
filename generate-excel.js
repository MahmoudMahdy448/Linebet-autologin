import { existsSync, readFileSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const numbersJsonPath = path.resolve(process.cwd(), 'extracted_numbers.json');

if (!existsSync(numbersJsonPath)) {
  console.log('No extracted_numbers.json found. Run "npm run login" first.');
  process.exit(1);
}

const numbers = JSON.parse(readFileSync(numbersJsonPath, 'utf8'));
const unique = [...new Set(numbers)];

if (!unique.length) {
  console.log('No phone numbers to export.');
  process.exit(0);
}

const wb = XLSX.utils.book_new();
const data = unique.map((num) => ({ Phone: num }));
const ws = XLSX.utils.json_to_sheet(data);
XLSX.utils.book_append_sheet(wb, ws, 'Phone Numbers');
XLSX.writeFile(wb, 'extracted_numbers.xlsx');

console.log(`Extracted ${unique.length} unique phone number(s) to extracted_numbers.xlsx`);
