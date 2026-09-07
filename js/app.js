/**
 * App — wires the UI to the extraction pipeline.
 * Phase 1 scope: Steps 1–4 (Upload → Extraction → Ansh calculation).
 * Steps 5–12 (Bhu-Naksha upload, map matching, report, Google Map,
 * print) are placeholders for Phase 2.
 */
const App = (() => {
  const state = {
    files: [],
    khatas: {},          // khataNo -> Khata record (accumulator)
    allPlotsFlat: [],     // denormalized plots for checkbox selection
    selectedPlots: [],     // chosen at Step 5
    bhuNakshaRecords: [],  // parsed eBhunaksha pages
    matches: [],           // RecordMatcher output
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

  function renderFileList(valid, rejected, boxId = 'fileListBox') {
    const box = el(boxId);
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

  function renderError(fileName, message, boxId = 'fileListBox') {
    const box = el(boxId);
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
    state.allPlotsFlat = [];
    let anyPlots = false;

    Object.values(state.khatas).forEach(khata => {
      (khata.plots || []).forEach(plot => {
        anyPlots = true;
        const holder = khata.holders[plot.holderIdentityKey];
        const { status: anshStatus, anshArea } = RevenueCalculator.computePlotAnsh(plot);

        const flatIndex = state.allPlotsFlat.length;
        state.allPlotsFlat.push({
          khataNo: khata.khataNo,
          plotNo: plot.plotNo,
          area: plot.area,
          shareText: plot.shareText,
          shareStatus: plot.shareStatus,
          anshArea, anshStatus,
          holderName: holder ? holder.name : '',
          holderFatherHusband: holder ? holder.fatherHusband : '',
          sourceFile: plot.sourceFile,
          sourcePage: plot.sourcePage,
          confidence: plot.confidence,
          needsVerification: plot.needsVerification
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" class="plot-select" data-index="${flatIndex}" /></td>
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
    el('plotSelectionActions').hidden = !anyPlots;

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

  // ---------- STEP 5: confirm plot selection ----------
  function getSelectedPlots() {
    return Array.from(document.querySelectorAll('.plot-select:checked'))
      .map(cb => state.allPlotsFlat[Number(cb.dataset.index)]);
  }

  function confirmPlotSelection() {
    const selected = getSelectedPlots();
    if (!selected.length) {
      setProgress('कृपया कम से कम एक प्लॉट चुनें (Please select at least one plot)');
      return;
    }
    state.selectedPlots = selected;
    setStep(5);
    el('bhunakshaSection').hidden = false;
    renderSelectedPlotsPreview();
    el('bhunakshaSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSelectedPlotsPreview() {
    const box = el('selectedPlotsPreview');
    box.innerHTML = '';
    state.selectedPlots.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'file-chip file-chip--ok';
      chip.textContent = `खाता ${p.khataNo} · खसरा ${p.plotNo} — ${p.holderName}`;
      box.appendChild(chip);
    });
  }

  // ---------- STEP 6/7: Bhu-Naksha upload + extraction ----------
  async function handleBhuNakshaFiles(fileList) {
    const files = Array.from(fileList);
    const validFiles = [];
    const rejected = [];
    for (const f of files) {
      const { ok, errors } = DocumentLoader.validate(f, ['pdf', 'jpg', 'jpeg', 'png']);
      if (ok) validFiles.push(f);
      else rejected.push({ file: f, errors });
    }
    renderFileList(validFiles, rejected, 'bhunakshaFileListBox');
    if (!validFiles.length) return;

    el('bhunakshaProgressBox').hidden = false;
    state.bhuNakshaRecords = [];

    for (let fi = 0; fi < validFiles.length; fi++) {
      const file = validFiles[fi];
      setBnProgress(`फ़ाइल पढ़ी जा रही है (Reading file) ${fi + 1}/${validFiles.length}: ${file.name}`);
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          await processBhuNakshaPdf(file);
        } else {
          await processBhuNakshaImage(file);
        }
      } catch (err) {
        console.error(err);
        renderError(file.name, err.message || String(err), 'bhunakshaFileListBox');
      }
    }

    setBnProgress('भू-नक्शा निष्कर्षण पूर्ण (Bhu-Naksha extraction complete)');
    setStep(6);
    runMatching();
  }

  function setBnProgress(msg) { el('bhunakshaProgressLine').textContent = msg; }

  async function processBhuNakshaPdf(file) {
    const buf = await DocumentLoader.readAsArrayBuffer(file);
    const pdfDoc = await PDFTextExtractor.loadDocument(buf.slice(0));
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      setBnProgress(`पृष्ठ पढ़ा जा रहा है (Reading page) ${p}/${pdfDoc.numPages} — ${file.name}`);
      const { page, items } = await PDFTextExtractor.extractPageItems(pdfDoc, p);
      const rows = PDFTextExtractor.reconstructRows(items);
      const bands = PDFTextExtractor.detectColumnBands(rows);
      const flatText = PDFTextExtractor.flattenRowsToText(rows);
      const integrity = TextIntegrityChecker.score(flatText);

      let table, fullText;
      if (integrity.corrupted) {
        setBnProgress(`टेक्स्ट लेयर क्षतिग्रस्त — OCR चल रहा है — पृष्ठ ${p}`);
        const canvas = await OCRProcessor.renderPdfPageToCanvas(page, 2.2);
        const ocrResult = await OCRProcessor.recognize(canvas, pct => setBnProgress(`OCR पृष्ठ ${p} — ${pct}%`));
        fullText = ocrResult.text;
        table = ocrResult.text.split('\n').filter(l => l.trim()).map(l => [l.trim()]);
      } else {
        fullText = flatText;
        table = PDFTextExtractor.rowsToTable(rows, bands);
      }

      const record = BhuNakshaParser.parsePage(table, fullText, { fileName: file.name, pageNumber: p });
      state.bhuNakshaRecords.push(record);
    }
  }

  async function processBhuNakshaImage(file) {
    setBnProgress(`छवि पर OCR चल रहा है — ${file.name}`);
    const canvas = await OCRProcessor.imageFileToCanvas(file);
    const ocrResult = await OCRProcessor.recognize(canvas, pct => setBnProgress(`OCR — ${pct}%`));
    const table = ocrResult.text.split('\n').filter(l => l.trim()).map(l => [l.trim()]);
    const record = BhuNakshaParser.parsePage(table, ocrResult.text, { fileName: file.name, pageNumber: 1 });
    state.bhuNakshaRecords.push(record);
  }

  // ---------- STEP 8: matching ----------
  function runMatching() {
    state.matches = RecordMatcher.match(state.selectedPlots, state.bhuNakshaRecords);
    renderMatches();
    renderHolderChoices();
    el('matchingSection').hidden = false;
    el('khataDharakSection').hidden = false;
  }

  function matchBadgeClass(status) {
    if (status === 'Matched') return 'badge badge--ok';
    if (status.startsWith('Needs Verification') || status === 'Mismatch') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  function renderMatches() {
    const tbody = el('matchesTableBody');
    tbody.innerHTML = '';
    state.matches.forEach(m => {
      const bn = m.bhuNaksha;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(m.plot.khataNo)}</td>
        <td>${escapeHtml(m.plot.plotNo)}</td>
        <td>${escapeHtml(m.plot.holderName)}</td>
        <td>${bn ? escapeHtml(bn.khataNo) + ' / ' + escapeHtml(bn.khasraNo) : '<span class="muted">—</span>'}</td>
        <td>${bn && bn.coordinateAvailable ? escapeHtml(bn.latitude) + ', ' + escapeHtml(bn.longitude) : '<span class="muted">No Lat/Long Available</span>'}</td>
        <td><span class="${matchBadgeClass(m.matchStatus)}">${escapeHtml(m.matchStatus)}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------- STEP 9: Khata Dharak selection ----------
  function renderHolderChoices() {
    const box = el('holderChoiceBox');
    box.innerHTML = '';
    const seen = new Set();
    state.selectedPlots.forEach(p => {
      const key = `${p.khataNo}::${p.holderName}::${p.holderFatherHusband}`;
      if (seen.has(key)) return;
      seen.add(key);
      const label = document.createElement('label');
      label.className = 'radio-row';
      label.innerHTML = `<input type="radio" name="holderChoice" value="${escapeHtml(key)}" />
        <span>${escapeHtml(p.holderName)} · ${escapeHtml(p.holderFatherHusband)} · खाता ${escapeHtml(p.khataNo)}</span>`;
      box.appendChild(label);
    });
  }

  function generateReport() {
    const checked = document.querySelector('input[name="holderChoice"]:checked');
    if (!checked) { setProgress('कृपया एक खातेदार चुनें (Please select a Khata Dharak)'); return; }
    const [khataNo, name, fatherHusband] = checked.value.split('::');

    const holderMatches = state.matches.filter(m =>
      m.plot.khataNo === khataNo && m.plot.holderName === name && m.plot.holderFatherHusband === fatherHusband
    );
    // attach anshArea/anshStatus onto plot for ReportGenerator
    holderMatches.forEach(m => {
      m.plot.anshArea = m.plot.anshArea;
      m.plot.anshStatus = m.plot.anshStatus;
    });

    const khataRecord = Object.values(state.khatas).find(k => k.khataNo === khataNo);
    const metadata = khataRecord ? khataRecord.metadata : {};

    const report = ReportGenerator.buildReport({
      khataMetadata: metadata,
      holder: { name, fatherHusband, khataNo },
      matchedRows: holderMatches
    });

    renderReport(report, holderMatches);
    setStep(7);
    el('reportSection').hidden = false;
    el('mapSection').hidden = false;
    MapRenderer.render(el('mapBox'), holderMatches);
    el('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderReport(report, holderMatches) {
    el('reportHeaderBox').innerHTML = `
      <div><strong>जनपद:</strong> ${escapeHtml(report.header.district)}</div>
      <div><strong>परगना:</strong> ${escapeHtml(report.header.pargana)}</div>
      <div><strong>तहसील:</strong> ${escapeHtml(report.header.tehsil)}</div>
      <div><strong>ग्राम:</strong> ${escapeHtml(report.header.village)}</div>
      <div><strong>फसली वर्ष:</strong> ${escapeHtml(report.header.fasliYear)}</div>
      <div><strong>खातेदार:</strong> ${escapeHtml(report.holder.name)} · ${escapeHtml(report.holder.fatherHusband)} · खाता ${escapeHtml(report.holder.khataNo)}</div>
    `;
    const tbody = el('reportTableBody');
    tbody.innerHTML = '';
    report.rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.khataNo)}</td>
        <td>${escapeHtml(r.plotNo)}</td>
        <td>${r.area != null ? escapeHtml(r.area) : '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(r.recordedAnsh)}</td>
        <td>${r.anshArea != null ? escapeHtml(r.anshArea) : '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(r.coordinateLabel)}</td>
        <td>${escapeHtml(r.source)}</td>
        <td><span class="${matchBadgeClass(r.verification)}">${escapeHtml(r.verification)}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function init() {
    el('khatoniInput').addEventListener('change', (e) => handleFiles(e.target.files));
    el('selectAllPlots').addEventListener('click', () => {
      document.querySelectorAll('.plot-select').forEach(cb => cb.checked = true);
    });
    el('clearAllPlots').addEventListener('click', () => {
      document.querySelectorAll('.plot-select').forEach(cb => cb.checked = false);
    });
    el('confirmPlotSelection').addEventListener('click', confirmPlotSelection);
    el('bhunakshaInput').addEventListener('change', (e) => handleBhuNakshaFiles(e.target.files));
    el('generateReportBtn').addEventListener('click', generateReport);
    el('printReportBtn').addEventListener('click', () => window.print());
    setStep(1);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
