/**
 * App — wires the UI to the extraction pipeline.
 * Phase 1 scope: Steps 1–4 (Upload → Extraction → Ansh calculation).
 * Steps 5–12 (Bhu-Naksha upload, map matching, report, Google Map,
 * print) are placeholders for Phase 2.
 */
const App = (() => {
  const state = {
    files: [],
    khatas: {},        // khataNo -> Khata record (accumulator)
    step: 1
  };

  const el = (id) => document.getElementById(id);

  function setStep(n) {
    state.step = n;
    document.querySelectorAll('.step').forEach(s => {
      const stepNum = Number(s.dataset.step);
      s.classList.toggle('step--active', stepNum === n);
      s.classList.toggle('step--done', stepNum < n);
    });
  }

  function setProgress(msg) {
    el('progressLine').textContent = msg;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    const validFiles = [];
    const rejected = [];

    for (const f of files) {
      const { ok, errors } = DocumentLoader.validate(f);
      if (ok) validFiles.push(f);
      else rejected.push({ file: f, errors });
    }

    renderFileList(validFiles, rejected);
    if (!validFiles.length) return;

    setStep(2);
    el('extractionSection').hidden = false;
    let lastKhataNo = null;

    for (let fi = 0; fi < validFiles.length; fi++) {
      const file = validFiles[fi];
      setProgress(`फ़ाइल पढ़ी जा रही है (Reading file) ${fi + 1} / ${validFiles.length}: ${file.name}`);
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          lastKhataNo = await processPdf(file, lastKhataNo);
        } else {
          lastKhataNo = await processImage(file, lastKhataNo);
        }
      } catch (err) {
        console.error(err);
        renderError(file.name, err.message || String(err));
      }
    }

    setProgress('निष्कर्षण पूर्ण (Extraction complete)');
    setStep(3);
    renderExtractedPlots();
    setStep(4);
    renderAnshSummary();
  }

  async function processPdf(file, lastKhataNo) {
    const buf = await DocumentLoader.readAsArrayBuffer(file);
    const pdfDoc = await PDFTextExtractor.loadDocument(buf.slice(0));
    const numPages = pdfDoc.numPages;

    for (let p = 1; p <= numPages; p++) {
      setProgress(`पृष्ठ पढ़ा जा रहा है (Reading page) ${p} / ${numPages} — ${file.name}`);
      const { page, items } = await PDFTextExtractor.extractPageItems(pdfDoc, p);
      const rows = PDFTextExtractor.reconstructRows(items);
      const bands = PDFTextExtractor.detectColumnBands(rows);
      const flatText = PDFTextExtractor.flattenRowsToText(rows);

      const integrity = TextIntegrityChecker.score(flatText);
      let table, headerText;

      if (integrity.corrupted) {
        setProgress(`टेक्स्ट लेयर क्षतिग्रस्त पाया गया — OCR चल रहा है (Text layer corrupted, running OCR) — पृष्ठ ${p}`);
        const canvas = await OCRProcessor.renderPdfPageToCanvas(page, 2.2);
        const ocrResult = await OCRProcessor.recognize(canvas, (pct) =>
          setProgress(`OCR पृष्ठ ${p} — ${pct}%`)
        );
        headerText = ocrResult.text;
        // Without reliable OCR word bounding boxes mapped back into our
        // column bands, we fall back to a single-column table for OCR'd
        // pages and mark every row for verification — honest about the
        // limitation rather than pretending column alignment survived.
        table = ocrResult.text.split('\n').filter(l => l.trim()).map(l => [l.trim()]);
        table._ocr = true;
      } else {
        headerText = flatText;
        table = PDFTextExtractor.rowsToTable(rows, bands);
      }

      const headerParse = KhatoniHeaderParser.parse(headerText);
      const khataNo = headerParse.metadata.khataNo || lastKhataNo || 'UNKNOWN';
      headerParse.metadata.khataNo = khataNo; // page-continuation: reuse previous Khata No if this page omits it
      lastKhataNo = khataNo;

      if (table._ocr) {
        // Mark this page's contribution as needing full manual verification.
        if (!state.khatas[khataNo]) {
          state.khatas[khataNo] = { khataNo, metadata: headerParse.metadata, holders: {}, plots: [], source: [] };
        }
        state.khatas[khataNo].source.push({ fileName: file.name, pageNumber: p, ocrFallback: true });
        state.khatas[khataNo].ocrRawPages = state.khatas[khataNo].ocrRawPages || [];
        state.khatas[khataNo].ocrRawPages.push({ page: p, text: headerText });
        continue;
      }

      KhatoniTableParser.parsePageIntoKhatas(table, headerParse.metadata, state.khatas, {
        fileName: file.name, pageNumber: p
      });
    }
    return lastKhataNo;
  }

  async function processImage(file, lastKhataNo) {
    setProgress(`छवि पर OCR चल रहा है (Running OCR on image) — ${file.name}`);
    const canvas = await OCRProcessor.imageFileToCanvas(file);
    const ocrResult = await OCRProcessor.recognize(canvas, (pct) => setProgress(`OCR — ${pct}%`));
    const headerParse = KhatoniHeaderParser.parse(ocrResult.text);
    const khataNo = headerParse.metadata.khataNo || lastKhataNo || 'UNKNOWN';
    if (!state.khatas[khataNo]) {
      state.khatas[khataNo] = { khataNo, metadata: headerParse.metadata, holders: {}, plots: [], source: [] };
    }
    state.khatas[khataNo].source.push({ fileName: file.name, pageNumber: 1, ocrFallback: true });
    state.khatas[khataNo].ocrRawPages = state.khatas[khataNo].ocrRawPages || [];
    state.khatas[khataNo].ocrRawPages.push({ page: 1, text: ocrResult.text });
    return khataNo;
  }

  function renderFileList(valid, rejected) {
    const box = el('fileListBox');
    box.innerHTML = '';
    valid.forEach(f => {
      const d = document.createElement('div');
      d.className = 'file-chip file-chip--ok';
      d.textContent = `✓ ${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
      box.appendChild(d);
    });
    rejected.forEach(({ file, errors }) => {
      const d = document.createElement('div');
      d.className = 'file-chip file-chip--error';
      d.textContent = `✕ ${file.name} — ${errors.join('; ')}`;
      box.appendChild(d);
    });
  }

  function renderError(fileName, message) {
    const box = el('fileListBox');
    const d = document.createElement('div');
    d.className = 'file-chip file-chip--error';
    d.textContent = `✕ ${fileName} — ${message}`;
    box.appendChild(d);
  }

  function statusBadgeClass(status) {
    if (status === 'Calculated') return 'badge badge--ok';
    if (status === 'Needs Verification' || status === 'Needs_Verification') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  function renderExtractedPlots() {
    const tbody = el('plotsTableBody');
    tbody.innerHTML = '';
    let anyPlots = false;

    Object.values(state.khatas).forEach(khata => {
      (khata.plots || []).forEach(plot => {
        anyPlots = true;
        const holder = khata.holders[plot.holderIdentityKey];
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" class="plot-select" /></td>
          <td>${escapeHtml(plot.sourceFile)}</td>
          <td>${escapeHtml(plot.sourcePage)}</td>
          <td>${escapeHtml(khata.khataNo)}</td>
          <td>${escapeHtml(holder ? holder.name : '')}</td>
          <td>${escapeHtml(holder ? holder.fatherHusband : '')}</td>
          <td>${escapeHtml(plot.plotNo)}</td>
          <td>${plot.area != null ? escapeHtml(plot.area) : '<span class="muted">—</span>'}</td>
          <td>${escapeHtml(plot.shareText || '—')}</td>
          <td><span class="${statusBadgeClass(plot.confidence === 'low' ? 'Needs Verification' : 'Calculated')}">${plot.needsVerification ? 'सत्यापन आवश्यक' : 'ठीक'}</span></td>
        `;
        tbody.appendChild(tr);
      });
    });

    el('plotsSection').hidden = !anyPlots;
    el('noPlotsNote').hidden = anyPlots;

    // Any OCR-only pages: surface raw text honestly instead of pretending
    // it was structured.
    const ocrKhatas = Object.values(state.khatas).filter(k => k.ocrRawPages && k.ocrRawPages.length);
    const ocrBox = el('ocrRawBox');
    ocrBox.innerHTML = '';
    if (ocrKhatas.length) {
      el('ocrRawSection').hidden = false;
      ocrKhatas.forEach(k => {
        k.ocrRawPages.forEach(p => {
          const pre = document.createElement('pre');
          pre.className = 'ocr-raw';
          pre.textContent = `[${k.khataNo === 'UNKNOWN' ? 'खाता अज्ञात' : k.khataNo} · पृष्ठ ${p.page}]\n${p.text}`;
          ocrBox.appendChild(pre);
        });
      });
    } else {
      el('ocrRawSection').hidden = true;
    }
  }

  function renderAnshSummary() {
    const tbody = el('anshTableBody');
    tbody.innerHTML = '';
    let any = false;

    Object.values(state.khatas).forEach(khata => {
      const summary = RevenueCalculator.buildHolderSummary(khata);
      summary.forEach(row => {
        any = true;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(row.khataNo)}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.fatherHusband)}</td>
          <td>${escapeHtml(row.plots.map(p => p.plotNo).join(', '))}</td>
          <td>${escapeHtml(row.totalKhataArea)}</td>
          <td>${escapeHtml(row.recordedShareTexts.join('; ') || '—')}</td>
          <td>${row.calculatedAnshArea != null ? escapeHtml(row.calculatedAnshArea) : '<span class="muted">—</span>'}</td>
          <td><span class="${statusBadgeClass(row.status)}">${row.status === 'Calculated' ? 'गणना पूर्ण' : row.status === 'Needs Verification' ? 'सत्यापन आवश्यक' : 'निर्धारित नहीं'}</span></td>
        `;
        tbody.appendChild(tr);
      });

      if (khata.totalArea != null) {
        const tr = document.createElement('tr');
        tr.className = 'row-total';
        tr.innerHTML = `<td colspan="4">खाता ${escapeHtml(khata.khataNo)} — कुल खाता क्षेत्रफल (Total Khata Area)</td>
          <td>${escapeHtml(khata.totalArea)}</td><td colspan="3"></td>`;
        tbody.appendChild(tr);
      }
    });

    el('anshSection').hidden = !any;
  }

  function init() {
    el('khatoniInput').addEventListener('change', (e) => handleFiles(e.target.files));
    el('selectAllPlots').addEventListener('click', () => {
      document.querySelectorAll('.plot-select').forEach(cb => cb.checked = true);
    });
    el('clearAllPlots').addEventListener('click', () => {
      document.querySelectorAll('.plot-select').forEach(cb => cb.checked = false);
    });
    setStep(1);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
