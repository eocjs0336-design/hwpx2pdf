/**
 * Core Application Logic: HWPX to PDF Client-Side Converter
 * Built with JSZip for decompression, DOMParser for XML parsing, and html2pdf.js for client-side PDF generation.
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const btnDemoTop = document.getElementById('btn-demo-top');
    const btnUploadNew = document.getElementById('btn-upload-new');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnDownloadJpeg = document.getElementById('btn-download-jpeg');
    const btnCopyText = document.getElementById('btn-copy-text');
    
    const panelUpload = document.getElementById('panel-upload');
    const panelViewer = document.getElementById('panel-viewer');
    
    // Zoom Controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomFit = document.getElementById('btn-zoom-fit');
    const txtZoom = document.getElementById('txt-zoom');
    const paperContainer = document.getElementById('paper-container');
    const renderTarget = document.getElementById('render-target');
    const scroller = document.getElementById('scroller');

    // Mobile Responsive Controls
    const mobileBtnPdf = document.getElementById('mobile-btn-pdf');
    const mobileBtnJpeg = document.getElementById('mobile-btn-jpeg');
    const mobileBtnToggleSidebar = document.getElementById('mobile-btn-toggle-sidebar');
    const btnSidebarClose = document.getElementById('btn-sidebar-close');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const viewerSidebar = document.querySelector('.viewer-sidebar');
    
    // PDF Config Controls
    const selectMargins = document.getElementById('select-margins');
    const selectPageSize = document.getElementById('select-pagesize');
    const selectColorMode = document.getElementById('select-colormode');
    const chkIncludeImages = document.getElementById('chk-include-images');
    const chkPageBreaks = document.getElementById('chk-page-breaks');
    const chkIncludeAudit = document.getElementById('chk-include-audit');
    
    // Watermarks
    const selectWatermark = document.getElementById('select-watermark');
    const inputWatermarkText = document.getElementById('input-watermark-text');
    const wrapperWatermarkText = document.getElementById('wrapper-watermark-text');
    const sliderWatermarkOpacity = document.getElementById('slider-watermark-opacity');
    const txtWatermarkOpacity = document.getElementById('txt-watermark-opacity');
    
    // Inspector Meta
    const metaTitle = document.getElementById('meta-title');
    const metaAuthor = document.getElementById('meta-author');
    const metaDate = document.getElementById('meta-date');
    const metaVersion = document.getElementById('meta-version');
    const infoParagraphs = document.getElementById('info-paragraphs');
    const infoRuns = document.getElementById('info-runs');
    const infoTables = document.getElementById('info-tables');
    const infoImages = document.getElementById('info-images');
    const txtFilename = document.getElementById('txt-filename');
    
    // Loader overlay
    const loaderOverlay = document.getElementById('loader-overlay');
    const loaderStatus = document.getElementById('loader-status');
    const loaderDetails = document.getElementById('loader-details');
    const loaderProgress = document.getElementById('loader-progress');

    // State Variables
    let currentZip = null;
    let imageBlobMap = {}; // Maps image item ID to local Object URL
    let charPrMap = {}; // Character properties map
    let paraPrMap = {}; // Paragraph properties map
    let currentFileName = "";
    let zoomLevel = 1.0;
    
    // Helper counters for Inspector
    let countParagraphs = 0;
    let countRuns = 0;
    let countTables = 0;
    let countImages = 0;

    // --- XML Parsing Helpers ---

    /**
     * Case-insensitive, prefix-agnostic XML attribute getter
     */
    function getXmlAttribute(element, name) {
        if (!element || !element.attributes) return null;
        const targetName = name.toLowerCase();
        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            const localName = attr.localName ? attr.localName.toLowerCase() : attr.name.toLowerCase();
            const baseName = localName.split(':').pop();
            if (baseName === targetName) {
                return attr.value;
            }
        }
        return null;
    }

    /**
     * Recursively searches for the first element matching localName (ignores namespace prefix)
     */
    function findElementByLocalName(element, localName) {
        if (!element) return null;
        if (element.nodeType === 1 && element.localName === localName) {
            return element;
        }
        if (element.childNodes) {
            for (let i = 0; i < element.childNodes.length; i++) {
                const found = findElementByLocalName(element.childNodes[i], localName);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Recursively searches for all elements matching localName (ignores namespace prefix)
     */
    function findAllElementsByLocalName(element, localName, results = []) {
        if (!element) return results;
        if (element.nodeType === 1 && element.localName === localName) {
            results.push(element);
        }
        if (element.childNodes) {
            for (let i = 0; i < element.childNodes.length; i++) {
                findAllElementsByLocalName(element.childNodes[i], localName, results);
            }
        }
        return results;
    }

    /**
     * Resolves a file inside the ZIP archive based on relative/fallback paths
     */
    function getZipFile(zip, relativePath, parentPath = "Contents/") {
        let file = zip.file(relativePath);
        if (file) return file;
        
        file = zip.file(parentPath + relativePath);
        if (file) return file;
        
        const normPath = relativePath.replace(/^\//, '');
        file = zip.file(normPath);
        if (file) return file;
        
        const filename = relativePath.split('/').pop();
        const searchRegex = new RegExp(filename + '$', 'i');
        const matches = zip.file(searchRegex);
        if (matches && matches.length > 0) {
            return matches[0];
        }
        
        return null;
    }

    // --- Loading UI Handlers ---

    function showLoader(status, details, progressPercent) {
        loaderOverlay.classList.add('active');
        loaderStatus.textContent = status;
        loaderDetails.textContent = details;
        loaderProgress.style.width = `${progressPercent}%`;
    }

    function hideLoader() {
        loaderOverlay.classList.remove('active');
    }

    // --- Drag & Drop Event Listeners ---

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        }, false);
    });

    let batchFilesList = []; // Holds list of files in the batch queue

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleSelectedFiles(files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSelectedFiles(e.target.files);
        }
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    // --- Main File Processing Flow ---

    function handleSelectedFiles(files) {
        if (files.length === 1) {
            // Single file processing
            document.getElementById('section-batch-queue').style.display = 'none';
            document.querySelector('.dropzone-content').style.display = 'block';
            handleSelectedFile(files[0]);
        } else if (files.length > 1) {
            // Batch processing mode
            batchFilesList = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const isHwpx = file.name.toLowerCase().endsWith('.hwpx');
                const isDocx = file.name.toLowerCase().endsWith('.docx');
                if (isHwpx || isDocx) {
                    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                    batchFilesList.push({
                        file: file,
                        name: file.name,
                        type: isHwpx ? 'HWPX' : 'DOCX',
                        size: `${sizeMB} MB`,
                        status: 'waiting' // waiting, converting, completed, failed
                    });
                }
            }
            
            if (batchFilesList.length === 0) {
                alert('올바른 .hwpx 또는 .docx 파일 형식을 업로드해 주세요.');
                return;
            }
            
            renderBatchQueue();
        }
    }

    function renderBatchQueue() {
        const sectionBatchQueue = document.getElementById('section-batch-queue');
        const batchQueueBody = document.getElementById('batch-queue-body');
        const txtBatchSummary = document.getElementById('txt-batch-summary');
        const dropzoneContent = document.querySelector('.dropzone-content');
        
        // Hide normal dropzone text content, but keep dropzone alive as wrapper
        dropzoneContent.style.display = 'none';
        sectionBatchQueue.style.display = 'block';
        
        txtBatchSummary.textContent = `대기 중인 파일: ${batchFilesList.length}개`;
        batchQueueBody.innerHTML = '';
        
        batchFilesList.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'badge-waiting';
            let badgeText = '대기 중';
            if (item.status === 'converting') {
                badgeClass = 'badge-converting';
                badgeText = '변환 중';
            } else if (item.status === 'completed') {
                badgeClass = 'badge-completed';
                badgeText = '완료';
            } else if (item.status === 'failed') {
                badgeClass = 'badge-failed';
                badgeText = '실패';
            }
            
            tr.innerHTML = `
                <td style="font-weight: 500;">${item.name}</td>
                <td style="text-align: center;"><span class="badge ${item.type === 'HWPX' ? 'badge-completed' : 'badge-waiting'}" style="min-width: 60px;">${item.type}</span></td>
                <td style="text-align: right; color: var(--text-muted);">${item.size}</td>
                <td style="text-align: center;"><span class="badge ${badgeClass}">${badgeText}</span></td>
            `;
            batchQueueBody.appendChild(tr);
        });
    }

    function updateBatchProgress(percent) {
        const progressFill = document.getElementById('batch-overall-progress');
        const progressPercentText = document.getElementById('txt-batch-progress-percent');
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressPercentText) progressPercentText.textContent = `${Math.round(percent)}% 완료`;
    }

    // Connect Batch Buttons
    const btnBatchClear = document.getElementById('btn-batch-clear');
    if (btnBatchClear) {
        btnBatchClear.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering dropzone click
            batchFilesList = [];
            document.getElementById('section-batch-queue').style.display = 'none';
            document.querySelector('.dropzone-content').style.display = 'block';
            fileInput.value = "";
        });
    }

    const btnBatchStart = document.getElementById('btn-batch-start');
    if (btnBatchStart) {
        btnBatchStart.addEventListener('click', async (e) => {
            e.stopPropagation(); // Avoid triggering dropzone click
            if (batchFilesList.length === 0) return;
            
            btnBatchStart.disabled = true;
            if (btnBatchClear) btnBatchClear.disabled = true;
            
            let completedCount = 0;
            
            for (let i = 0; i < batchFilesList.length; i++) {
                const item = batchFilesList[i];
                item.status = 'converting';
                renderBatchQueue();
                
                try {
                    const arrayBuffer = await readFileAsArrayBuffer(item.file);
                    currentFileName = item.file.name;
                    
                    if (item.type === 'HWPX') {
                        await processHWPX(arrayBuffer, true);
                    } else {
                        await processDOCX(arrayBuffer, true);
                    }
                    
                    await downloadPdfForBatch(item.name);
                    item.status = 'completed';
                } catch (err) {
                    console.error('Batch conversion error for ' + item.name, err);
                    item.status = 'failed';
                }
                
                completedCount++;
                updateBatchProgress((completedCount / batchFilesList.length) * 100);
                renderBatchQueue();
            }
            
            alert('모든 파일의 일괄 변환 및 다운로드가 완료되었습니다.');
            btnBatchStart.disabled = false;
            if (btnBatchClear) btnBatchClear.disabled = false;
        });
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('파일 읽기 실패'));
            reader.readAsArrayBuffer(file);
        });
    }

    async function downloadPdfForBatch(filename) {
        const outName = filename.replace(/\.hwpx$/i, '').replace(/\.docx$/i, '') + '.pdf';
        await generatePdf(outName, true);
    }

    function handleSelectedFile(file) {
        const isHwpx = file.name.toLowerCase().endsWith('.hwpx');
        const isDocx = file.name.toLowerCase().endsWith('.docx');
        
        if (!isHwpx && !isDocx) {
            alert('올바른 .hwpx 또는 .docx 파일 형식을 업로드해 주세요.');
            return;
        }
        
        currentFileName = file.name;
        txtFilename.textContent = file.name;
        
        // --- CRITICAL UI RESET: Instantly clean up all DOM preview nodes & inspectors ---
        renderTarget.innerHTML = "";
        const oldWatermarks = renderTarget.querySelectorAll('.watermark-overlay');
        oldWatermarks.forEach(wm => wm.remove());
        
        metaTitle.textContent = "-";
        metaAuthor.textContent = "-";
        metaDate.textContent = "-";
        metaVersion.textContent = "-";
        infoParagraphs.textContent = "0";
        infoRuns.textContent = "0";
        infoTables.textContent = "0";
        infoImages.textContent = "0";
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            const arrayBuffer = e.target.result;
            try {
                if (isHwpx) {
                    await processHWPX(arrayBuffer, false);
                } else {
                    await processDOCX(arrayBuffer, false);
                }
            } catch (err) {
                console.error(err);
                alert('파일을 처리하는 중 오류가 발생했습니다: ' + err.message);
                hideLoader();
            }
        };
        reader.onerror = function() {
            alert('파일을 읽는 중 오류가 발생했습니다.');
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Converts DOCX file to HTML and populates preview + metadata using Mammoth.js
     */
    async function processDOCX(arrayBuffer, isBatch = false) {
        if (!isBatch) {
            showLoader('DOCX 파일 파싱 중...', 'Word 문서 구조를 해독하고 있습니다.', 30);
        }
        
        // Clean old object URLs
        Object.values(imageBlobMap).forEach(url => URL.revokeObjectURL(url));
        imageBlobMap = {};
        charPrMap = {};
        paraPrMap = {};
        countParagraphs = 0;
        countRuns = 0;
        countTables = 0;
        countImages = 0;

        if (!isBatch) {
            showLoader('DOCX 레이아웃 변환 중...', '워드 내용을 HTML 형식으로 변환하고 있습니다.', 60);
        }
        
        // Convert using mammoth.js
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const html = result.value; // The generated HTML
        
        // Insert into render target
        renderTarget.innerHTML = `<div class="section-container docx-content">${html}</div>`;
        
        // Traverse and calculate inspector counts
        const docDom = renderTarget.querySelector('.docx-content');
        if (docDom) {
            // Count paragraphs, tables, images
            countParagraphs = docDom.querySelectorAll('p').length;
            countTables = docDom.querySelectorAll('table').length;
            countImages = docDom.querySelectorAll('img').length;
            
            // Add custom styled classes to tables, paragraphs, images for standard looks
            const tables = docDom.querySelectorAll('table');
            tables.forEach(tbl => tbl.className = 'document-table');
            
            const paragraphs = docDom.querySelectorAll('p');
            paragraphs.forEach(p => p.className = 'document-p');
            
            const images = docDom.querySelectorAll('img');
            images.forEach(img => img.className = 'document-img');
        }
        
        // Set metadata info (Word document details)
        metaTitle.textContent = currentFileName.replace(/\.docx$/i, '');
        metaAuthor.textContent = '로컬 사용자';
        metaDate.textContent = new Date().toISOString().split('T')[0];
        metaVersion.textContent = "Office OpenXML (DOCX)";
        infoParagraphs.textContent = countParagraphs;
        infoRuns.textContent = "-";
        infoTables.textContent = countTables;
        infoImages.textContent = countImages;

        // Reset layouts and display preview
        if (!isBatch) {
            hideLoader();
            panelUpload.classList.remove('active');
            panelViewer.classList.add('active');
            updatePaperLayouts();
            triggerAutoZoomFit(); // Intelligent mobile viewport scale auto-fitting
        } else {
            updatePaperLayouts();
        }
    }

    /**
     * Unzips and orchestrates XML parsing
     */
    async function processHWPX(arrayBuffer, isBatch = false) {
        if (!isBatch) {
            showLoader('압축 해제 중...', 'HWPX ZIP 컨테이너 파일을 여는 중입니다.', 15);
        }
        
        // Clean old object URLs to avoid memory leaks
        Object.values(imageBlobMap).forEach(url => URL.revokeObjectURL(url));
        imageBlobMap = {};
        charPrMap = {};
        paraPrMap = {};
        countParagraphs = 0;
        countRuns = 0;
        countTables = 0;
        countImages = 0;

        // Load Zip archive
        currentZip = await JSZip.loadAsync(arrayBuffer);
        
        // 1. Parse Manifest: Contents/content.hpf
        if (!isBatch) {
            showLoader('구조 분석 중...', '패키지 명세서(content.hpf)를 읽고 있습니다.', 30);
        }
        let manifestFile = getZipFile(currentZip, "Contents/content.hpf", "");
        if (!manifestFile) {
            manifestFile = getZipFile(currentZip, "content.hpf", "");
        }
        
        let sectionFiles = [];
        let metaInfo = { title: currentFileName, creator: '-', date: '-', version: 'Hancom OWPML' };
        let mediaMap = {}; // Maps item ID to ZIP entry path for images

        if (manifestFile) {
            const hpfText = await manifestFile.async("text");
            const parser = new DOMParser();
            const hpfDoc = parser.parseFromString(hpfText, "text/xml");
            
            // Extract Meta Info
            const titleNode = hpfDoc.getElementsByTagName('dc:title')[0] || hpfDoc.getElementsByTagName('title')[0];
            const creatorNode = hpfDoc.getElementsByTagName('dc:creator')[0] || hpfDoc.getElementsByTagName('creator')[0];
            const dateNode = hpfDoc.getElementsByTagName('dc:date')[0] || hpfDoc.getElementsByTagName('date')[0];
            
            if (titleNode && titleNode.textContent) metaInfo.title = titleNode.textContent;
            if (creatorNode && creatorNode.textContent) metaInfo.creator = creatorNode.textContent;
            if (dateNode && dateNode.textContent) metaInfo.date = dateNode.textContent.split('T')[0];
            
            // Build media list & spine
            const items = hpfDoc.getElementsByTagName('item');
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const id = getXmlAttribute(item, 'id');
                const href = getXmlAttribute(item, 'href');
                const mediaType = getXmlAttribute(item, 'media-type');
                
                if (mediaType && mediaType.startsWith('image/')) {
                    mediaMap[id] = href;
                }
            }
            
            const itemRefs = hpfDoc.getElementsByTagName('itemref');
            for (let i = 0; i < itemRefs.length; i++) {
                const idref = getXmlAttribute(itemRefs[i], 'idref');
                // Find matching item
                for (let j = 0; j < items.length; j++) {
                    if (getXmlAttribute(items[j], 'id') === idref) {
                        sectionFiles.push(getXmlAttribute(items[j], 'href'));
                        break;
                    }
                }
            }
        }
        
        // Fallback if spine is empty
        if (sectionFiles.length === 0) {
            sectionFiles.push("Contents/section0.xml");
        }

        // 2. Parse Header: Contents/header.xml for styles mapping
        showLoader('스타일 분석 중...', '글꼴 및 단락 스타일 정보(header.xml)를 추출하고 있습니다.', 50);
        let headerFile = getZipFile(currentZip, "Contents/header.xml", "");
        if (headerFile) {
            const headerText = await headerFile.async("text");
            const parser = new DOMParser();
            const headerDoc = parser.parseFromString(headerText, "text/xml");
            
            // Parse character properties (charPr)
            const charPrs = findAllElementsByLocalName(headerDoc, 'charPr');
            charPrs.forEach(charPr => {
                const id = getXmlAttribute(charPr, 'id');
                if (id) {
                    const style = {};
                    
                    const height = getXmlAttribute(charPr, 'height');
                    if (height) {
                        style.fontSize = (parseInt(height) / 100) + 'pt';
                    }
                    
                    const textColor = getXmlAttribute(charPr, 'textColor');
                    if (textColor) {
                        style.color = textColor;
                    }
                    
                    // Bold, Italic check (attribute OR child tag)
                    const bold = getXmlAttribute(charPr, 'bold') === '1' || getXmlAttribute(charPr, 'bold') === 'true' || findElementByLocalName(charPr, 'bold') !== null;
                    if (bold) style.fontWeight = 'bold';
                    
                    const italic = getXmlAttribute(charPr, 'italic') === '1' || getXmlAttribute(charPr, 'italic') === 'true' || findElementByLocalName(charPr, 'italic') !== null;
                    if (italic) style.fontStyle = 'italic';
                    
                    const underlineNode = findElementByLocalName(charPr, 'underline') || findElementByLocalName(charPr, 'underLine');
                    if (underlineNode) {
                        style.textDecoration = 'underline';
                    }
                    
                    charPrMap[id] = style;
                }
            });

            // Parse paragraph properties (paraPr / paraProperties)
            const paraPrs = findAllElementsByLocalName(headerDoc, 'paraPr');
            paraPrs.forEach(paraPr => {
                const id = getXmlAttribute(paraPr, 'id');
                if (id) {
                    const style = {};
                    
                    // Alignment
                    const alignNode = findElementByLocalName(paraPr, 'align');
                    if (alignNode) {
                        const horiz = getXmlAttribute(alignNode, 'horizontal');
                        if (horiz) {
                            const h = horiz.toLowerCase();
                            if (h === 'center') style.textAlign = 'center';
                            else if (h === 'right') style.textAlign = 'right';
                            else if (h === 'justify' || h === 'distribute') style.textAlign = 'justify';
                            else style.textAlign = 'left';
                        }
                    }
                    
                    // Margins (hwpunit fallback)
                    const marginNode = findElementByLocalName(paraPr, 'margin');
                    if (marginNode) {
                        const left = getXmlAttribute(marginNode, 'left');
                        const right = getXmlAttribute(marginNode, 'right');
                        if (left && parseInt(left) > 0) style.marginLeft = (parseInt(left) / 100) + 'pt';
                        if (right && parseInt(right) > 0) style.marginRight = (parseInt(right) / 100) + 'pt';
                    }
                    
                    paraPrMap[id] = style;
                }
            });
        }

        // 3. Load Embedded Images (BinData) - Fully synchronous & robust to avoid race conditions
        showLoader('이미지 파일 변환 중...', '문서에 포함된 이미지를 로컬 안전 주소로 인코딩 중입니다.', 70);
        
        // Match all image binary zip entries
        const imageFiles = [];
        currentZip.forEach((relativePath, file) => {
            if (!file.dir && (relativePath.toLowerCase().includes('bindata/') || relativePath.toLowerCase().endsWith('.png') || relativePath.toLowerCase().endsWith('.jpg') || relativePath.toLowerCase().endsWith('.jpeg') || relativePath.toLowerCase().endsWith('.gif') || relativePath.toLowerCase().endsWith('.emf') || relativePath.toLowerCase().endsWith('.wmf') || relativePath.toLowerCase().endsWith('.bmp'))) {
                imageFiles.push({ path: relativePath, file: file });
            }
        });
        
        for (let i = 0; i < imageFiles.length; i++) {
            const imgEntry = imageFiles[i];
            try {
                const imgBlob = await imgEntry.file.async("blob");
                const blobUrl = URL.createObjectURL(imgBlob);
                
                const filename = imgEntry.path.split('/').pop();
                const idWithoutExt = filename.split('.').slice(0, -1).join('.');
                
                // Map multiple variations of image references
                imageBlobMap[imgEntry.path] = blobUrl;
                imageBlobMap[filename] = blobUrl;
                imageBlobMap[idWithoutExt] = blobUrl;
                
                // Also map direct matches from mediaMap
                const matchingId = Object.keys(mediaMap).find(id => {
                    const href = mediaMap[id];
                    return href === imgEntry.path || href.endsWith(filename);
                });
                if (matchingId) {
                    imageBlobMap[matchingId] = blobUrl;
                }
                
                countImages++;
            } catch (e) {
                console.error("Failed to load binary image entry: " + imgEntry.path, e);
            }
        }

        // 4. Translate Body sections into HTML - Block-level direct sibling ordering
        showLoader('문서 본문 렌더링 중...', '텍스트 레이아웃을 HTML 형식으로 구성하고 있습니다.', 85);
        renderTarget.innerHTML = "";
        
        for (let s = 0; s < sectionFiles.length; s++) {
            const secFileHref = sectionFiles[s];
            let secFile = getZipFile(currentZip, secFileHref);
            if (!secFile) {
                secFile = getZipFile(currentZip, `Contents/${secFileHref}`, "");
            }
            
            if (secFile) {
                const secText = await secFile.async("text");
                const parser = new DOMParser();
                const secDoc = parser.parseFromString(secText, "text/xml");
                
                // Root element
                const bodyContainer = document.createElement('div');
                bodyContainer.className = 'section-container';
                if (s > 0) {
                    // Add section page break indicator
                    const pb = document.createElement('div');
                    pb.className = 'page-break-indicator';
                    renderTarget.appendChild(pb);
                }
                
                // Traverse direct children of the section element in order (paragraphs, tables, block pictures)
                const secNode = findElementByLocalName(secDoc, 'sec') || secDoc.documentElement;
                if (secNode) {
                    for (let i = 0; i < secNode.childNodes.length; i++) {
                        const child = secNode.childNodes[i];
                        if (child.nodeType !== 1) continue;
                        
                        const tag = child.localName;
                        if (tag === 'p') {
                            const pHtml = parseParagraphNode(child);
                            bodyContainer.appendChild(pHtml);
                        } else if (tag === 'tbl') {
                            const table = parseTableNode(child);
                            bodyContainer.appendChild(table);
                        } else if (tag === 'pic') {
                            const img = parsePictureNode(child);
                            if (img) bodyContainer.appendChild(img);
                        }
                    }
                }
                
                renderTarget.appendChild(bodyContainer);
            }
        }

        // 5. Update Inspector Metadata UI
        metaTitle.textContent = metaInfo.title;
        metaAuthor.textContent = metaInfo.creator;
        metaDate.textContent = metaInfo.date;
        metaVersion.textContent = metaInfo.version;
        infoParagraphs.textContent = countParagraphs;
        infoRuns.textContent = countRuns;
        infoTables.textContent = countTables;
        infoImages.textContent = countImages;

        // Reset layouts and display preview
        if (!isBatch) {
            hideLoader();
            panelUpload.classList.remove('active');
            panelViewer.classList.add('active');
            updatePaperLayouts();
            triggerAutoZoomFit(); // Intelligent mobile viewport scale auto-fitting
        } else {
            updatePaperLayouts();
        }
    }

    /**
     * Parses `<hp:p>` (Paragraph) XML node to HTML element
     */
    function parseParagraphNode(pNode) {
        countParagraphs++;
        const pElement = document.createElement('div');
        pElement.className = 'document-p';
        
        // Apply paragraph properties if referenced
        const pPr = findElementByLocalName(pNode, 'pPr');
        if (pPr) {
            const paraPrIDRef = getXmlAttribute(pPr, 'paraPrIDRef');
            if (paraPrIDRef && paraPrMap[paraPrIDRef]) {
                const styles = paraPrMap[paraPrIDRef];
                Object.assign(pElement.style, styles);
            }
        }
        
        // Iterate children
        const childNodes = pNode.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            if (child.nodeType !== 1) continue;
            
            const tag = child.localName;
            if (tag === 'run') {
                const span = parseRunNode(child);
                pElement.appendChild(span);
            } else if (tag === 'tbl') {
                const table = parseTableNode(child);
                pElement.appendChild(table);
            }
        }
        
        // If paragraph is completely empty, append a non-breaking space to retain spacing
        if (pElement.innerHTML === "") {
            pElement.innerHTML = "&nbsp;";
        }
        
        return pElement;
    }

    /**
     * Parses `<hp:run>` (Run/Span) XML node to HTML span
     */
    function parseRunNode(runNode) {
        countRuns++;
        const span = document.createElement('span');
        span.className = 'document-run';
        
        // Apply run styling from charPrMap
        const rPr = findElementByLocalName(runNode, 'rPr');
        let charPrIDRef = getXmlAttribute(runNode, 'charPrIDRef');
        if (rPr && !charPrIDRef) {
            charPrIDRef = getXmlAttribute(rPr, 'charPrIDRef');
        }
        
        if (charPrIDRef && charPrMap[charPrIDRef]) {
            Object.assign(span.style, charPrMap[charPrIDRef]);
        }
        
        // Parse children (text, pictures, line breaks)
        const childNodes = runNode.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            if (child.nodeType !== 1) continue;
            
            const tag = child.localName;
            if (tag === 't') {
                // Text content
                const textContent = child.textContent;
                // Preserve leading/trailing spaces by using textNode
                span.appendChild(document.createTextNode(textContent));
            } else if (tag === 'br') {
                span.appendChild(document.createElement('br'));
            } else if (tag === 'pic') {
                const img = parsePictureNode(child);
                if (img) span.appendChild(img);
            }
        }
        
        return span;
    }

    /**
     * Parses `<hp:pic>` (Picture/Drawing Object) XML node
     */
    function parsePictureNode(picNode) {
        const imgNode = findElementByLocalName(picNode, 'img');
        if (!imgNode) return null;
        
        const binaryItemIDRef = getXmlAttribute(imgNode, 'binaryItemIDRef');
        if (!binaryItemIDRef) return null;
        
        const img = document.createElement('img');
        img.className = 'document-img';
        img.dataset.imgId = binaryItemIDRef;
        
        // Set Image URL from Blob map if available
        if (imageBlobMap[binaryItemIDRef]) {
            img.src = imageBlobMap[binaryItemIDRef];
        } else {
            // Check direct match
            const fallbackUrl = Object.keys(imageBlobMap).find(key => key.includes(binaryItemIDRef));
            if (fallbackUrl) {
                img.src = imageBlobMap[fallbackUrl];
            } else {
                img.style.display = 'none'; // Hide broken image
            }
        }
        
        // Apply picture sizes if defined
        const curSz = findElementByLocalName(picNode, 'curSz');
        if (curSz) {
            const w = getXmlAttribute(curSz, 'width');
            const h = getXmlAttribute(curSz, 'height');
            // HWP sizes are in hwpunit (1mm is approx 283 hwpunits)
            if (w && h) {
                const widthMm = (parseInt(w) / 283).toFixed(1);
                img.style.width = widthMm + 'mm';
                img.style.maxWidth = '100%';
            }
        }
        
        return img;
    }

    /**
     * Parses `<hp:tbl>` (Table) XML node recursively to HTML
     * Limited to direct child elements for rows and cells to handle nested tables correctly.
     */
    function parseTableNode(tblNode) {
        countTables++;
        const table = document.createElement('table');
        table.className = 'document-table';
        
        // Table properties
        const borderNode = findElementByLocalName(tblNode, 'border');
        if (borderNode) {
            table.style.border = '1px solid #7F8C8D';
        }
        
        // Find row nodes: Handle direct 'tr' children OR 'tr' inside 'tbody'/'thead'/'tfoot'
        const trList = [];
        for (let i = 0; i < tblNode.childNodes.length; i++) {
            const child = tblNode.childNodes[i];
            if (child.nodeType !== 1) continue;
            
            const tag = child.localName.toLowerCase();
            if (tag === 'tr') {
                trList.push(child);
            } else if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
                // Safely grab direct 'tr' elements inside table body containers
                for (let j = 0; j < child.childNodes.length; j++) {
                    const subChild = child.childNodes[j];
                    if (subChild.nodeType === 1 && subChild.localName.toLowerCase() === 'tr') {
                        trList.push(subChild);
                    }
                }
            }
        }
        
        trList.forEach(trNode => {
            const tr = document.createElement('tr');
            
            // Find cell nodes: Support 'tc', 'td', and 'th'
            const tcList = [];
            for (let j = 0; j < trNode.childNodes.length; j++) {
                const child = trNode.childNodes[j];
                if (child.nodeType === 1) {
                    const tag = child.localName.toLowerCase();
                    if (tag === 'tc' || tag === 'td' || tag === 'th') {
                        tcList.push(child);
                    }
                }
            }
            
            tcList.forEach(tcNode => {
                const td = document.createElement('td');
                
                // Handle spans using case-insensitive/namespaced getter
                const colSpan = getXmlAttribute(tcNode, 'colSpan');
                const rowSpan = getXmlAttribute(tcNode, 'rowSpan');
                if (colSpan && parseInt(colSpan) > 1) td.setAttribute('colspan', colSpan);
                if (rowSpan && parseInt(rowSpan) > 1) td.setAttribute('rowspan', rowSpan);
                
                // Set original column widths if specified in hwpunit
                const tcPr = findElementByLocalName(tcNode, 'tcPr');
                let cellWidth = getXmlAttribute(tcNode, 'width');
                let cellHeight = getXmlAttribute(tcNode, 'height');
                
                if (tcPr) {
                    const sizeNode = findElementByLocalName(tcPr, 'size');
                    if (sizeNode) {
                        if (!cellWidth) cellWidth = getXmlAttribute(sizeNode, 'width');
                        if (!cellHeight) cellHeight = getXmlAttribute(sizeNode, 'height');
                    }
                }
                
                if (cellWidth && parseInt(cellWidth) > 0) {
                    const widthMm = (parseInt(cellWidth) / 283).toFixed(1);
                    td.style.width = widthMm + 'mm';
                }
                
                // Parse cell alignment (horizontal & vertical)
                if (tcPr) {
                    const alignNode = findElementByLocalName(tcPr, 'align');
                    if (alignNode) {
                        const horiz = getXmlAttribute(alignNode, 'horizontal');
                        const vert = getXmlAttribute(alignNode, 'vertical');
                        if (horiz) {
                            const h = horiz.toLowerCase();
                            if (h === 'center') td.style.textAlign = 'center';
                            else if (h === 'right') td.style.textAlign = 'right';
                            else if (h === 'justify') td.style.textAlign = 'justify';
                        }
                        if (vert) {
                            const v = vert.toLowerCase();
                            if (v === 'center') td.style.verticalAlign = 'middle';
                            else if (v === 'top') td.style.verticalAlign = 'top';
                            else if (v === 'bottom') td.style.verticalAlign = 'bottom';
                        }
                    }
                }
                
                // Parse table cell background color (fill -> winBrush -> faceColor)
                if (tcPr) {
                    const fill = findElementByLocalName(tcPr, 'fill');
                    if (fill) {
                        const winBrush = findElementByLocalName(fill, 'winBrush');
                        if (winBrush) {
                            const faceColor = getXmlAttribute(winBrush, 'faceColor');
                            if (faceColor) {
                                td.style.backgroundColor = faceColor;
                                
                                // Automatically adjust text color for high contrast readability using CSS dark-cell
                                const hex = faceColor.replace('#', '');
                                if (hex.length === 6) {
                                    const r = parseInt(hex.substring(0, 2), 16);
                                    const g = parseInt(hex.substring(2, 4), 16);
                                    const b = parseInt(hex.substring(4, 6), 16);
                                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                                    if (brightness < 130) {
                                        td.classList.add('dark-cell');
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Recursively parse cell text paragraphs (under subList) with a robust fallback mechanism
                let cellParagraphs = [];
                const subList = findElementByLocalName(tcNode, 'subList');
                
                if (subList) {
                    // 1. Standard OWPML: Iterate direct children paragraphs of subList
                    for (let k = 0; k < subList.childNodes.length; k++) {
                        const cellChild = subList.childNodes[k];
                        if (cellChild.nodeType === 1 && cellChild.localName === 'p') {
                            cellParagraphs.push(cellChild);
                        }
                    }
                } else {
                    // 2. Fallback A: Check if 'p' elements are direct children of tcNode
                    for (let k = 0; k < tcNode.childNodes.length; k++) {
                        const cellChild = tcNode.childNodes[k];
                        if (cellChild.nodeType === 1 && cellChild.localName === 'p') {
                            cellParagraphs.push(cellChild);
                        }
                    }
                    // 3. Fallback B: Search recursively for all nested descendant 'p' elements inside tcNode
                    if (cellParagraphs.length === 0) {
                        findAllElementsByLocalName(tcNode, 'p', cellParagraphs);
                    }
                }
                
                cellParagraphs.forEach(pNode => {
                    const pHtml = parseParagraphNode(pNode);
                    td.appendChild(pHtml);
                });
                
                tr.appendChild(td);
            });
            
            table.appendChild(tr);
        });
        
        return table;
    }

    // --- Interactive Layout Controller Actions ---

    function applyZoom(scale) {
        zoomLevel = scale;
        txtZoom.textContent = `${Math.round(zoomLevel * 100)}%`;
        renderTarget.style.transform = `scale(${zoomLevel})`;
        
        // Adjust container height to match scaled target to avoid excessive bottom padding
        const rect = renderTarget.getBoundingClientRect();
        paperContainer.style.height = `${rect.height}px`;
        paperContainer.style.width = `${rect.width}px`;
    }

    function updatePaperLayouts() {
        // Handle Margin Class
        renderTarget.classList.remove('margin-normal', 'margin-narrow', 'margin-wide', 'margin-zero');
        renderTarget.classList.add(`margin-${selectMargins.value}`);
        
        // Handle Paper Size Class
        renderTarget.classList.remove('size-a4', 'size-letter');
        renderTarget.classList.add(`size-${selectPageSize.value}`);
        
        // Handle Color Mode Class
        paperContainer.classList.remove('grayscale-mode', 'highcontrast-mode');
        if (selectColorMode.value === 'grayscale') {
            paperContainer.classList.add('grayscale-mode');
        } else if (selectColorMode.value === 'highcontrast') {
            paperContainer.classList.add('highcontrast-mode');
        }
        
        // Toggle Embedded Images
        const docImages = renderTarget.querySelectorAll('.document-img');
        docImages.forEach(img => {
            img.style.display = chkIncludeImages.checked ? 'block' : 'none';
        });
        
        // Toggle Page Break Dividers
        const dividers = renderTarget.querySelectorAll('.page-break-indicator');
        dividers.forEach(div => {
            div.style.display = chkPageBreaks.checked ? 'block' : 'none';
        });

        // Handle Watermarks
        const oldWatermarks = renderTarget.querySelectorAll('.watermark-overlay');
        oldWatermarks.forEach(wm => wm.remove());

        const wmType = selectWatermark ? selectWatermark.value : 'none';
        if (wmType !== 'none') {
            let wmText = '대외비';
            let wmColor = '#E74C3C';
            
            if (wmType === 'copy') {
                wmText = '사본';
                wmColor = '#7F8C8D';
            } else if (wmType === 'custom') {
                wmText = (inputWatermarkText && inputWatermarkText.value) ? inputWatermarkText.value : '행정안전부';
                wmColor = '#3498DB';
            }
            
            const opacityVal = sliderWatermarkOpacity ? parseFloat(sliderWatermarkOpacity.value) / 100 : 0.15;
            
            const containers = renderTarget.querySelectorAll('.section-container, .docx-content');
            containers.forEach(container => {
                container.style.position = 'relative';
                
                const overlay = document.createElement('div');
                overlay.className = 'watermark-overlay';
                
                const txtSpan = document.createElement('span');
                txtSpan.className = 'watermark-text';
                txtSpan.textContent = wmText;
                txtSpan.style.color = wmColor;
                txtSpan.style.opacity = opacityVal;
                
                overlay.appendChild(txtSpan);
                container.insertBefore(overlay, container.firstChild);
            });
        }

        // Recalculate zoom fitting bounds
        applyZoom(zoomLevel);
    }

    // Auto-fit document zoom scale dynamically based on viewport bounds
    function triggerAutoZoomFit() {
        if (!scroller || !renderTarget) return;
        const padding = window.innerWidth <= 768 ? 24 : 48; // Narrower padding on mobile
        const containerWidth = scroller.clientWidth - padding;
        const paperWidth = renderTarget.offsetWidth || 793;
        
        const fitScale = (containerWidth / paperWidth).toFixed(2);
        const clampedScale = Math.min(Math.max(parseFloat(fitScale), 0.35), 2.0);
        applyZoom(clampedScale);
    }

    // Zoom Listeners
    btnZoomIn.addEventListener('click', () => {
        if (zoomLevel < 3.0) applyZoom(zoomLevel + 0.1);
    });

    btnZoomOut.addEventListener('click', () => {
        if (zoomLevel > 0.3) applyZoom(zoomLevel - 0.1);
    });

    btnZoomFit.addEventListener('click', () => {
        triggerAutoZoomFit();
    });

    // Handle screen rotation and desktop window resize auto-fit dynamically
    window.addEventListener('resize', () => {
        if (panelViewer && panelViewer.classList.contains('active')) {
            triggerAutoZoomFit();
        }
    });

    // Configuration Select Dropdowns Listeners
    [selectMargins, selectPageSize, selectColorMode].forEach(widget => {
        if (widget) widget.addEventListener('change', updatePaperLayouts);
    });
    
    [chkIncludeImages, chkPageBreaks, chkIncludeAudit].forEach(toggle => {
        if (toggle) toggle.addEventListener('change', updatePaperLayouts);
    });

    // Connect Watermark Config controls
    if (selectWatermark) {
        selectWatermark.addEventListener('change', () => {
            if (selectWatermark.value === 'custom') {
                if (wrapperWatermarkText) wrapperWatermarkText.style.display = 'block';
            } else {
                if (wrapperWatermarkText) wrapperWatermarkText.style.display = 'none';
            }
            updatePaperLayouts();
        });
    }

    if (inputWatermarkText) {
        inputWatermarkText.addEventListener('input', updatePaperLayouts);
    }

    if (sliderWatermarkOpacity) {
        sliderWatermarkOpacity.addEventListener('input', (e) => {
            if (txtWatermarkOpacity) txtWatermarkOpacity.textContent = `${e.target.value}%`;
            updatePaperLayouts();
        });
    }

    // Connect Text Copy Button
    if (btnCopyText) {
        btnCopyText.addEventListener('click', () => {
            const paragraphs = renderTarget.querySelectorAll('.document-p, p, td');
            if (paragraphs.length === 0) {
                alert('복사할 텍스트 본문이 없습니다.');
                return;
            }
            
            let copiedText = "";
            
            function extractCleanText(node) {
                let text = "";
                
                if (node.nodeType === 3) {
                    const val = node.nodeValue.trim();
                    if (val) text += val + " ";
                } else if (node.nodeType === 1) {
                    const tagName = node.tagName.toLowerCase();
                    
                    if (node.classList.contains('document-p') || tagName === 'p') {
                        let pText = "";
                        node.childNodes.forEach(child => {
                            pText += extractCleanText(child);
                        });
                        if (pText.trim()) {
                            text += pText.trim() + "\n";
                        }
                    } else if (tagName === 'table') {
                        text += "\n[표 시작]\n";
                        node.childNodes.forEach(child => {
                            text += extractCleanText(child);
                        });
                        text += "[표 끝]\n\n";
                    } else if (tagName === 'tr') {
                        let rowText = "";
                        node.childNodes.forEach(child => {
                            rowText += extractCleanText(child);
                        });
                        if (rowText.trim()) text += rowText.trim() + "\n";
                    } else if (tagName === 'td' || tagName === 'th') {
                        let cellText = "";
                        node.childNodes.forEach(child => {
                            cellText += extractCleanText(child);
                        });
                        if (cellText.trim()) text += cellText.trim() + " | ";
                    } else if (node.classList.contains('document-run') || tagName === 'span') {
                        node.childNodes.forEach(child => {
                            text += extractCleanText(child);
                        });
                    } else if (tagName === 'br') {
                        text += "\n";
                    } else {
                        node.childNodes.forEach(child => {
                            text += extractCleanText(child);
                        });
                    }
                }
                return text;
            }
            
            copiedText = extractCleanText(renderTarget);
            
            copiedText = copiedText
                .replace(/\n{3,}/g, '\n\n')
                .replace(/ \| \n/g, '\n')
                .trim();
                
            if (!copiedText) {
                alert('본문 텍스트를 추출할 수 없습니다.');
                return;
            }
            
            navigator.clipboard.writeText(copiedText).then(() => {
                const origText = btnCopyText.innerHTML;
                btnCopyText.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    본문 복사 완료
                `;
                btnCopyText.style.background = 'rgba(16, 185, 129, 0.2)';
                btnCopyText.style.color = '#10B981';
                btnCopyText.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                
                setTimeout(() => {
                    btnCopyText.innerHTML = origText;
                    btnCopyText.style.background = '';
                    btnCopyText.style.color = '';
                    btnCopyText.style.borderColor = '';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text', err);
                alert('텍스트 복사에 실패했습니다.');
            });
        });
    }

    // Reset button
    btnUploadNew.addEventListener('click', () => {
        panelViewer.classList.remove('active');
        panelUpload.classList.add('active');
        fileInput.value = "";
        
        // Reset batch queue layout if active
        document.getElementById('section-batch-queue').style.display = 'none';
        document.querySelector('.dropzone-content').style.display = 'block';
        batchFilesList = [];
    });

    // Logo navigation to Home screen
    const headerLogo = document.querySelector('.header-logo');
    if (headerLogo) {
        headerLogo.addEventListener('click', () => {
            panelViewer.classList.remove('active');
            panelUpload.classList.add('active');
            fileInput.value = "";
            
            // Reset batch queue layout if active
            document.getElementById('section-batch-queue').style.display = 'none';
            document.querySelector('.dropzone-content').style.display = 'block';
            batchFilesList = [];
        });
    }

    // --- IP Address & Date/Time Helpers for Security Audits ---

    async function getClientIp() {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 1000);
            const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
            clearTimeout(id);
            const data = await response.json();
            if (data && data.ip) return data.ip;
        } catch (e) {
            console.log("Offline or blocked public IP API, fallback to local WebRTC discovery");
        }

        try {
            return await new Promise((resolve) => {
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel('');
                pc.createOffer().then(offer => pc.setLocalDescription(offer));
                pc.onicecandidate = (ice) => {
                    if (!ice || !ice.candidate || !ice.candidate.candidate) {
                        resolve('127.0.0.1 (로컬)');
                        return;
                    }
                    const myIp = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
                    resolve(myIp ? myIp[1] : '127.0.0.1 (로컬)');
                    pc.close();
                };
                setTimeout(() => resolve('127.0.0.1 (로컬/오프라인)'), 500);
            });
        } catch (e) {
            return '127.0.0.1 (오프라인)';
        }
    }

    function getFormattedDateTime() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
    }

    // --- PDF Export Logic ---

    async function generatePdf(filename, isBatch = false) {
        if (!isBatch) {
            showLoader('PDF 변환 및 다운로드 중...', '브라우저에서 최종 PDF 결과물을 생성하고 있습니다.', 40);
        }
        
        // Page boundaries
        const formatSize = selectPageSize.value === 'a4' ? 'A4' : 'Letter';
        
        // Clean element copy for export
        const exportNode = renderTarget.cloneNode(true);
        exportNode.style.transform = 'none'; // Strip scale
        exportNode.style.boxShadow = 'none';
        exportNode.style.borderRadius = '0';
        exportNode.style.margin = '0';
        
        // Lock width to match standard page dimensions to prevent column wrap shifts
        if (selectPageSize.value === 'a4') {
            exportNode.style.width = '210mm';
        } else {
            exportNode.style.width = '215.9mm';
        }
        
        // Prevent table horizontal overflow clipping by resetting absolute cell widths inside export DOM
        try {
            const tables = exportNode.querySelectorAll('table');
            tables.forEach(table => {
                table.style.width = '100%';
                table.style.tableLayout = 'auto'; // Re-distribute columns automatically
                const cells = table.querySelectorAll('td, th');
                cells.forEach(cell => {
                    cell.style.width = ''; // Strip hardcoded mm widths in print DOM
                    cell.style.wordBreak = 'break-all'; // Force wraps
                    cell.style.overflowWrap = 'break-word';
                });
            });
        } catch (e) {
            console.error("Error auto-fitting tables for print:", e);
        }

        // Force HWPX section break pages exactly like original Hancom document
        try {
            const sections = exportNode.querySelectorAll('.section-container');
            sections.forEach((sec, idx) => {
                if (idx > 0) {
                    sec.style.pageBreakBefore = 'always';
                    sec.style.breakBefore = 'page';
                }
            });
        } catch (e) {
            console.error("Error setting section page breaks for print:", e);
        }
        
        // Hide break line indicators in printing export
        const indicators = exportNode.querySelectorAll('.page-break-indicator');
        indicators.forEach(ind => {
            ind.style.display = 'none';
        });

        // Hide images if unchecked
        if (!chkIncludeImages.checked) {
            const images = exportNode.querySelectorAll('.document-img');
            images.forEach(img => img.remove());
        }

        // Inject print stylesheets classes
        if (selectColorMode.value === 'grayscale') {
            exportNode.style.filter = 'grayscale(100%)';
        } else if (selectColorMode.value === 'highcontrast') {
            exportNode.style.backgroundColor = '#121212';
            exportNode.style.color = '#F3F4F6';
            const tds = exportNode.querySelectorAll('td, th');
            tds.forEach(td => {
                td.style.borderColor = '#444';
                td.style.color = '#F3F4F6';
            });
        }

        // Add Print Security Audit Trail if checked
        if (chkIncludeAudit && chkIncludeAudit.checked) {
            try {
                const ipAddr = await getClientIp();
                const dateTimeStr = getFormattedDateTime();
                const auditText = `[문서 보안] 출력 일시: ${dateTimeStr} | 출력 IP: ${ipAddr}`;
                
                const containers = exportNode.querySelectorAll('.section-container, .docx-content');
                containers.forEach(container => {
                    const auditDiv = document.createElement('div');
                    auditDiv.className = 'print-audit-trail';
                    auditDiv.textContent = auditText;
                    container.appendChild(auditDiv);
                });
            } catch (e) {
                console.error("Failed to inject print security audit trail", e);
            }
        }

        // --- Clean empty elements at the end of the document to prevent blank trailing pages ---
        try {
            const allPs = Array.from(exportNode.querySelectorAll('.document-p, p, div, span'));
            // Traverse backwards to safely strip consecutive empty nodes
            for (let i = allPs.length - 1; i >= 0; i--) {
                const node = allPs[i];
                if (!node || !node.parentNode) continue;
                
                const text = node.textContent.replace(/\u00a0/g, ' ').trim();
                const hasMedia = node.querySelector('img, table, svg, iframe') !== null;
                const isWatermark = node.classList.contains('watermark-overlay') || node.classList.contains('watermark-text');
                const isAudit = node.classList.contains('print-audit-trail');
                
                if (text === "" && !hasMedia && !isWatermark && !isAudit) {
                    node.remove();
                } else if (isWatermark || isAudit) {
                    // Skip these non-content structural elements and keep traversing backwards
                    continue;
                } else {
                    // Stop purging once we hit real visual text/images to preserve document integrity
                    break;
                }
            }
        } catch (e) {
            console.error("Error sanitizing empty trailing elements:", e);
        }

        // Read compression level
        const selectCompression = document.getElementById('select-compression');
        const compressionVal = selectCompression ? selectCompression.value : 'none';
        
        let imgQuality = 0.98;
        let canvasScale = 2; // Default high quality
        
        if (compressionVal === 'medium') {
            imgQuality = 0.70;
            canvasScale = 1.5;
        } else if (compressionVal === 'high') {
            imgQuality = 0.40;
            canvasScale = 1.0;
        }

        const opt = {
            margin:       0,
            filename:     filename,
            image:        { type: 'jpeg', quality: imgQuality },
            html2canvas:  { scale: canvasScale, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: formatSize.toLowerCase(), orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] } // Removed avoid-all to prevent random forced layout splitting blank pages
        };

        try {
            await html2pdf().from(exportNode).set(opt).save();
            if (!isBatch) hideLoader();
        } catch (err) {
            console.error(err);
            if (!isBatch) {
                alert('PDF 생성 오류: ' + err.message);
                hideLoader();
            }
            throw err;
        }
    }

    btnDownloadPdf.addEventListener('click', async () => {
        const outName = currentFileName.replace(/\.hwpx$/i, '').replace(/\.docx$/i, '') + '.pdf';
        await generatePdf(outName, false);
    });

    // --- JPEG Image Export Logic ---

    async function generateJpeg(isBatch = false) {
        if (!isBatch) {
            showLoader('JPEG 변환 중...', '각 구역을 고해상도 JPEG 이미지 파일로 변환하고 있습니다.', 40);
        }

        const containers = renderTarget.querySelectorAll('.section-container, .docx-content');
        if (containers.length === 0) {
            alert('변환할 문서 구역이 존재하지 않습니다.');
            if (!isBatch) hideLoader();
            return;
        }

        const selectCompression = document.getElementById('select-compression');
        const compressionVal = selectCompression ? selectCompression.value : 'none';
        
        let canvasScale = 2; // Default high quality
        if (compressionVal === 'medium') canvasScale = 1.5;
        else if (compressionVal === 'high') canvasScale = 1.0;

        for (let idx = 0; idx < containers.length; idx++) {
            const container = containers[idx];
            
            // Clean element copy for rendering individual page image
            const exportNode = container.cloneNode(true);
            exportNode.style.transform = 'none';
            exportNode.style.boxShadow = 'none';
            exportNode.style.borderRadius = '0';
            exportNode.style.margin = '0';
            exportNode.style.width = selectPageSize.value === 'a4' ? '210mm' : '215.9mm';
            exportNode.style.backgroundColor = '#FFFFFF';
            exportNode.style.color = '#111827';
            
            // Temporary mount container to actual DOM for html2canvas to read styles perfectly
            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.top = '-9999px';
            wrapper.style.left = '-9999px';
            wrapper.style.width = exportNode.style.width;
            wrapper.appendChild(exportNode);
            document.body.appendChild(wrapper);

            try {
                // Ensure html2canvas is executed safely
                const canvas = await html2canvas(exportNode, {
                    scale: canvasScale,
                    useCORS: true,
                    backgroundColor: '#FFFFFF',
                    logging: false
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const baseName = currentFileName.replace(/\.hwpx$/i, '').replace(/\.docx$/i, '');
                const filename = `${baseName}_page${idx + 1}.jpg`;

                // Auto download trigger
                const link = document.createElement('a');
                link.href = imgData;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

            } catch (err) {
                console.error("Failed to generate JPEG for page " + (idx + 1), err);
            } finally {
                document.body.removeChild(wrapper);
            }
        }

        if (!isBatch) hideLoader();
    }

    if (btnDownloadJpeg) {
        btnDownloadJpeg.addEventListener('click', async () => {
            await generateJpeg(false);
        });
    }

    // --- Interactive Demo Document Mode Generator ---

    const demoDocName = "HWPX_to_PDF_제품소개서.hwpx";
    
    // Beautiful Base64 SVG diagram for inline demo picture
    const sampleSvgBase64 = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDUwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjUwMCIgaGVpZ2h0PSIyMDAiIHJ4PSIxMiIgZmlsbD0idXJsKCNkZW1vLWdyYWQpIi8+CiAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTAwIiByPSI0MCIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPgogIDxjaXJjbGUgY3g9IjQwMCIgY3k9IjEwMCIgcj0iNDAiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xNSkiLz4KICAKICBmaWxsPSJ3aGl0ZSI+CiAgPHBhdGggZD0iTTg1IDExNVY4NUg5NVY5NUgxMDVWODVIMTE1VjExNUgxMDVWMTBVMjVMOTUgMTA1TDU1IDExNVoiIGZpbGw9IndoaXRlIi8++Cjwvc3ZnPg==";

    function loadDemoDocument() {
        showLoader('데모 생성 중...', '대화형 웹앱 데모용 HWPX 구조체를 구축하는 중입니다.', 40);
        
        setTimeout(() => {
            currentFileName = demoDocName;
            txtFilename.textContent = demoDocName;
            
            // Clean previous state
            Object.values(imageBlobMap).forEach(url => URL.revokeObjectURL(url));
            imageBlobMap = {};
            
            // Register demo image
            imageBlobMap["demo_img_1"] = sampleSvgBase64;
            
            // Insert mock structured HTML
            renderTarget.innerHTML = `
                <div class="section-container">
                    <div class="document-p" style="text-align: center; margin-bottom: 2rem;">
                        <span class="document-run" style="font-size: 24pt; font-weight: bold; color: #10B981;">HWPX to PDF 로컬 웹앱 소개</span>
                    </div>
                    <div class="document-p" style="text-align: center; margin-bottom: 1.5rem;">
                        <span class="document-run" style="font-size: 14pt; font-style: italic; color: #7F8C8D;">웹 브라우저 내부에서 작동하는 완전 로컬 하이엔드 변환 솔루션</span>
                    </div>
                    
                    <div class="document-p" style="margin-top: 2rem; margin-bottom: 1rem;">
                        <span class="document-run" style="font-size: 16pt; font-weight: bold; border-bottom: 2px solid #10B981; padding-bottom: 4px;">1. 주요 기술 특징 및 설계</span>
                    </div>
                    <div class="document-p">
                        <span class="document-run" style="font-size: 11pt;">본 애플리케이션은 한글과컴퓨터 오피스의 개방형 규격인 </span>
                        <span class="document-run" style="font-size: 11pt; font-weight: bold; color: #059669;">OWPML (KS X 6101)</span>
                        <span class="document-run" style="font-size: 11pt;"> 문서 규격을 완벽하게 분석하여 번거로운 서버 연결 없이 사용자 컴퓨터 내부에서 HTML5 렌더 트리로 직접 재가공하는 하이퍼 렌더러입니다.</span>
                    </div>
                    <div class="document-p">
                        <span class="document-run" style="font-size: 11pt;">외부 서버 전송이 완전히 배제되어 있으므로, </span>
                        <span class="document-run" style="font-size: 11pt; text-decoration: underline; font-weight: bold; color: #E74C3C;">기업 기밀 문서 및 대외비 기획안</span>
                        <span class="document-run" style="font-size: 11pt;"> 등을 강력한 보안 상태로 유지하며 빠르게 PDF 변환 작업을 마칠 수 있습니다.</span>
                    </div>
                    
                    <!-- SVG diagram inline demo image -->
                    <div class="document-p" style="text-align: center; margin: 2rem 0;">
                        <img class="document-img" src="${sampleSvgBase64}" style="width: 160mm; max-width: 100%; border-radius: 8px;" alt="변환 기술 프로세스">
                    </div>
                    
                    <div class="document-p" style="margin-top: 2.5rem; margin-bottom: 1rem;">
                        <span class="document-run" style="font-size: 16pt; font-weight: bold; border-bottom: 2px solid #10B981; padding-bottom: 4px;">2. 포맷 변환 규격 비교</span>
                    </div>
                    
                    <table class="document-table" style="border: 1px solid #BDC3C7; width: 100%; border-collapse: collapse; margin-top: 1rem;">
                        <thead>
                            <tr style="background-color: #F8F9FA;">
                                <th style="border: 1px solid #BDC3C7; padding: 10px; font-weight: bold; text-align: center;">비교 항목</th>
                                <th style="border: 1px solid #BDC3C7; padding: 10px; font-weight: bold; text-align: center;">기존 서버 변환 방식</th>
                                <th style="border: 1px solid #BDC3C7; padding: 10px; font-weight: bold; text-align: center; color: #10B981;">본 오프라인 로컬 방식</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; font-weight: bold; text-align: center;">기밀 보안성</td>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; text-align: center;">취약 (파일의 제3자 서버 전송 필수)</td>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; text-align: center; font-weight: bold; color: #10B981;">완벽 보안 (1Byte의 서버 송신 없음)</td>
                            </tr>
                            <tr>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; font-weight: bold; text-align: center;">변환 지연 속도</td>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; text-align: center;">느림 (업로드 & 다운로드 통신 지연 발생)</td>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; text-align: center; font-weight: bold; color: #10B981;">즉시 완료 (클라이언트 브라우저 즉시 렌더링)</td>
                            </tr>
                            <tr>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; font-weight: bold; text-align: center;">인터페이스 편의</td>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; text-align: center;">단순 변환 후 결과 대기</td>
                                <td style="border: 1px solid #BDC3C7; padding: 10px; text-align: center; font-weight: bold; color: #10B981;">강력함 (실시간 화면 뷰어 및 맞춤 여백 선택)</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div class="document-p" style="margin-top: 2rem;">
                        <span class="document-run" style="font-size: 11pt;">오른쪽 </span>
                        <span class="document-run" style="font-size: 11pt; font-weight: bold; color: #10B981;">"PDF 파일로 다운로드"</span>
                        <span class="document-run" style="font-size: 11pt;"> 버튼을 클릭하여 본 예제가 완벽한 벡터 포맷의 고해상도 PDF 파일로 내려받아지는 환상적인 기술력을 직접 확인해보세요!</span>
                    </div>
                </div>
            `;
            
            // Set metadata counts
            metaTitle.textContent = "HWPX to PDF 제품 기술 소개서";
            metaAuthor.textContent = "개발팀 홍길동 수석";
            metaDate.textContent = "2026-05-26";
            metaVersion.textContent = "OWPML v1.2 Standard";
            infoParagraphs.textContent = "12";
            infoRuns.textContent = "38";
            infoTables.textContent = "1";
            infoImages.textContent = "1";
            
            hideLoader();
            panelUpload.classList.remove('active');
            panelViewer.classList.add('active');
            
            updatePaperLayouts();
            triggerAutoZoomFit(); // Intelligent mobile/device viewport scale auto-fitting
        }, 800);
    }

    // --- Mobile Interactivity & Drawer Toggle Logic ---

    // Toggle Drawer Up
    if (mobileBtnToggleSidebar) {
        mobileBtnToggleSidebar.addEventListener('click', () => {
            if (viewerSidebar) viewerSidebar.classList.add('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
        });
    }

    // Toggle Drawer Down (via Backdrop)
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
            if (viewerSidebar) viewerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        });
    }

    // Toggle Drawer Down (via Close Button)
    if (btnSidebarClose) {
        btnSidebarClose.addEventListener('click', () => {
            if (viewerSidebar) viewerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        });
    }

    // Connect Mobile Actions to existing logic
    if (mobileBtnPdf) {
        mobileBtnPdf.addEventListener('click', async () => {
            // Close drawer if open
            if (viewerSidebar) viewerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            
            // Trigger PDF Download
            const outName = currentFileName.replace(/\.hwpx$/i, '').replace(/\.docx$/i, '') + '.pdf';
            await generatePdf(outName, false);
        });
    }

    if (mobileBtnJpeg) {
        mobileBtnJpeg.addEventListener('click', async () => {
            // Close drawer if open
            if (viewerSidebar) viewerSidebar.classList.remove('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            
            // Trigger JPEG Download
            await generateJpeg(false);
        });
    }

    // Connect Demo Action Buttons
    btnDemoTop.addEventListener('click', loadDemoDocument);
});
