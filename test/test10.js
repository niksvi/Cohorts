import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve('/workspace/index.html'), 'utf8');

function extractCsvUrl(htmlText) {
	const m = htmlText.match(/const\s+CSV_URL\s*=\s*"([^"]+)"/);
	if (!m) throw new Error('CSV_URL not found in index.html');
	return m[1];
}

async function fetchCohortsFromCsv(csvUrl) {
	const res = await fetch(csvUrl, { redirect: 'follow' });
	if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
	const txt = await res.text();
	const rows = txt.trim().split(/\r?\n/).map(r => r.split(','));
	const cohorts = [];
	for (const r of rows) {
		const c = (r[2] || '').trim();
		if (/^[0-9]+$/.test(c)) cohorts.push(c);
	}
	return Array.from(new Set(cohorts));
}

const csvUrl = extractCsvUrl(html);
const cohortsFromCsv = await fetchCohortsFromCsv(csvUrl);

const dom = new JSDOM(html, {
	url: 'http://localhost/',
	runScripts: 'dangerously',
	resources: 'usable',
	pretendToBeVisual: true,
	beforeParse(window) {
		window.fetch = (...args) => fetch(...args);
		window.alert = () => {};
		window.document.execCommand = () => {};
	}
});

const { window } = dom;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(predicate, timeoutMs = 30000, intervalMs = 200) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			if (await predicate()) return;
		} catch {}
		await delay(intervalMs);
	}
	throw new Error('Timeout waiting for condition');
}

// Wait for window load
await new Promise(resolve => {
	if (window.document.readyState === 'complete') return resolve();
	window.addEventListener('load', () => resolve());
});

const chosenCohort = cohortsFromCsv[0] || '110';

function setInput(selector, value) {
	const el = window.document.querySelector(selector);
	el.value = value;
	el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function readResult() {
	return window.document.querySelector('#result').value;
}

async function waitForSuccessfulText() {
	await waitFor(() => /Могу предложить тебе выйти/i.test(readResult()));
}

async function runCases() {
	const outputs = [];

	// Case 1: cohort only (should error about sprint/project)
	setInput('#cohort', chosenCohort);
	setInput('#sprint', '');
	setInput('#project', '');
	await delay(100);
	outputs.push(`1) cohort=${chosenCohort}, sprint=, project= -> ${readResult()}`);

	// Ensure CSV parsed and app ready by performing a valid sprint and waiting for success
	setInput('#cohort', chosenCohort);
	setInput('#project', '');
	setInput('#sprint', '1');
	await waitForSuccessfulText();
	outputs.push(`2) cohort=${chosenCohort}, sprint=1, project= -> ${readResult()}`);

	// Cases 3-6: sprints 2..5
	for (let i = 2; i <= 5; i++) {
		setInput('#cohort', chosenCohort);
		setInput('#project', '');
		setInput('#sprint', String(i));
		await delay(100);
		outputs.push(`${i+1}) cohort=${chosenCohort}, sprint=${i}, project= -> ${readResult()}`);
	}

	// Case 7: project "1"
	setInput('#cohort', chosenCohort);
	setInput('#sprint', '');
	setInput('#project', '1');
	await delay(100);
	outputs.push(`7) cohort=${chosenCohort}, sprint=, project=1 -> ${readResult()}`);

	// Case 8: project "фс"
	setInput('#cohort', chosenCohort);
	setInput('#sprint', '');
	setInput('#project', 'фс');
	await delay(100);
	outputs.push(`8) cohort=${chosenCohort}, sprint=, project=фс -> ${readResult()}`);

	// Case 9: both sprint and project (error expected)
	setInput('#cohort', chosenCohort);
	setInput('#sprint', '2');
	setInput('#project', '1');
	await delay(100);
	outputs.push(`9) cohort=${chosenCohort}, sprint=2, project=1 -> ${readResult()}`);

	// Case 10: invalid cohort
	setInput('#cohort', '99999');
	setInput('#sprint', '1');
	setInput('#project', '');
	await delay(100);
	outputs.push(`10) cohort=99999, sprint=1, project= -> ${readResult()}`);

	return outputs;
}

const outputs = await runCases();
console.log(outputs.join('\n'));