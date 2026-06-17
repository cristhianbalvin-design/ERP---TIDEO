const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\tideo_design\\.gemini\\antigravity-ide\\brain\\31ae73f4-7076-4386-bbf6-d094ea435666\\.system_generated\\logs\\transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('BUG-03 parcial') && line.includes('USER_INPUT')) {
      const obj = JSON.parse(line);
      fs.writeFileSync('d:\\VIBECODING\\ERP - TIDEO\\prompt_full.txt', obj.content);
      console.log("File written to prompt_full.txt");
      break;
    }
  }
}

processLineByLine();
