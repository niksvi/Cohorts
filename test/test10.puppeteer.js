import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const PORT = 8080;
const ROOT = '/workspace';

function serveFile(res, filePath, contentType) {
	try {
		const data = fs.readFileSync(filePath);
		res.writeHead(200, { 'Content-Type': contentType });
		res.end(data);
	} catch (e) {
		res.writeHead(404);
		res.end('Not found');
	}
}

function startServer() {
	return new Promise(resolve => {
		const server = http.createServer((req, res) => {
			if (req.url === '/' || req.url === '/index.html') {
				serveFile(res, path.join(ROOT, 'index.html'), 'text/html; charset=utf-8');
			} else {
				res.writeHead(404);
				res.end('Not found');
			}
		});
		server.listen(PORT, () => resolve(server));
	});
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatLine(n, desc, text) {
	return `${n}) ${desc} -> ${text}`;
}

(async () => {
	const server = await startServer();
	const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
	const page = await browser.newPage();
	await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0', timeout: 60000 });

	const setInput = async (selector, value) => {
		await page.$eval(selector, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
	};
	const readResult = async () => await page.$eval('#result', el => el.value);

	// Ensure CSV parsed by trying a valid sprint and waiting for success text
	await setInput('#cohort', '');
	await setInput('#sprint', '');
	await setInput('#project', '');

	// Find a cohort by observing when success appears for sprint=1.
	// We'll try a few likely cohorts to speed up readiness.
	const candidateCohorts = ['110','111','112','113','114','115','116','117','118','119'];
	let chosen = null;
	for (const c of candidateCohorts) {
		await setInput('#cohort', c);
		await setInput('#project', '');
		await setInput('#sprint', '1');
		try {
			await page.waitForFunction(() => /Могу предложить тебе выйти/i.test(document.querySelector('#result').value), { timeout: 15000 });
			chosen = c; break;
		} catch {}
	}
	if (!chosen) {
		// Fallback: wait a bit more and proceed with current value
		chosen = await page.$eval('#cohort', el => el.value) || '110';
	}

	const outputs = [];

	// 1) cohort only
	await setInput('#cohort', chosen);
	await setInput('#sprint', '');
	await setInput('#project', '');
	await delay(100);
	outputs.push(formatLine(1, `cohort=${chosen}, sprint=, project=`, await readResult()));

	// 2..6) sprints 1..5
	for (let i = 1; i <= 5; i++) {
		await setInput('#cohort', chosen);
		await setInput('#project', '');
		await setInput('#sprint', String(i));
		await delay(100);
		outputs.push(formatLine(i+1, `cohort=${chosen}, sprint=${i}, project=`, await readResult()));
	}

	// 7) project 1
	await setInput('#cohort', chosen);
	await setInput('#sprint', '');
	await setInput('#project', '1');
	await delay(100);
	outputs.push(formatLine(7, `cohort=${chosen}, sprint=, project=1`, await readResult()));

	// 8) project фс
	await setInput('#cohort', chosen);
	await setInput('#sprint', '');
	await setInput('#project', 'фс');
	await delay(100);
	outputs.push(formatLine(8, `cohort=${chosen}, sprint=, project=фс`, await readResult()));

	// 9) both sprint and project
	await setInput('#cohort', chosen);
	await setInput('#sprint', '2');
	await setInput('#project', '1');
	await delay(100);
	outputs.push(formatLine(9, `cohort=${chosen}, sprint=2, project=1`, await readResult()));

	// 10) invalid cohort
	await setInput('#cohort', '99999');
	await setInput('#sprint', '1');
	await setInput('#project', '');
	await delay(100);
	outputs.push(formatLine(10, `cohort=99999, sprint=1, project=`, await readResult()));

	console.log(outputs.join('\n'));

	await browser.close();
	server.close();
})().catch(err => { console.error(err); process.exit(1); });