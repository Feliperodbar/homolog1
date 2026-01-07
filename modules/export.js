/**
 * Módulo de exportação.
 * Gera HTML e DOCX a partir dos passos.
 */

import { showToast } from './ui.js';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
} from 'docx';

// Configuração de dimensões de exportação
const EXPORT_IMAGE_WIDTH_CM = 20.23;
const EXPORT_IMAGE_HEIGHT_CM = 9.28;
const DOCX_IMAGE_MAX_WIDTH_CM = 7;
const DOCX_IMAGE_MAX_HEIGHT_CM = 10;

// Conversões de unidades
function cmToTwip(cm) {
    // 1 cm = 566.929 twips (aprox). Usar 567 para arredondamento comum
    return Math.round(cm * 567);
}

function cmToEmu(cm) {
    // 1 cm = 360000 EMU exatamente
    return Math.round(cm * 360000);
}

/**
 * Escapa HTML para evitar injections
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/**
 * Gera HTML exportável
 * @param {Array} steps - Lista de passos
 * @param {Object} projectData - Dados do projeto
 * @returns {string} HTML
 */
export function buildExportHtml(steps, projectData = {}) {
  const now = new Date();
  const CONTENT_WIDTH_CM = EXPORT_IMAGE_WIDTH_CM;
  const IMAGE_HEIGHT_CM = EXPORT_IMAGE_HEIGHT_CM;

  const stepsHtml = steps
    .map((s, i) => {
      const t = escapeHtml(s.title || `Passo ${i + 1}`);
      const d = escapeHtml(s.description || '');
      const tag = escapeHtml(s.tag || '');
      const img = s.imageDataUrl || '';

      return `<article style="border:none;border-radius:6px;padding:10px;background:#fafafa;margin:10px 0;">
        <header>
          <h3 style="margin:0 0 6px;color:#111827;font-family:system-ui,Segoe UI,Roboto">${t}</h3>
          ${tag ? `<p style="margin:0 0 8px;color:#374151;font-size:12px">Item clicado: ${tag}</p>` : ''}
        </header>
        ${img
            ? `<img src="${img}" alt="${t}" style="display:block;margin:6px auto;width:${CONTENT_WIDTH_CM}cm;height:auto;max-height:${IMAGE_HEIGHT_CM}cm;border:none;border-radius:6px;object-fit:contain">`
            : ''
          }
        ${d ? `<p style="margin:8px 0;color:#1f2937">${d}</p>` : ''}
      </article>`;
    })
    .join('');

  const metaEntries = [
    { label: 'Projeto', value: escapeHtml(projectData.projectName || '') },
    { label: 'Frente', value: escapeHtml(projectData.frontName || '') },
    { label: 'Distribuidora', value: escapeHtml(projectData.distributorName || '') },
    { label: 'Responsável', value: escapeHtml(projectData.responsible || '') },
    { label: 'Data', value: escapeHtml(projectData.projectDate || '') },
    { label: 'Resultado Esperado', value: escapeHtml(projectData.expectedResult || '') },
  ].filter(e => e.value && e.value.trim() !== '');

  const projectMetaHtml = metaEntries.length ? `
    <section style="margin-bottom:20px">
      <h2 style="margin:0 0 10px;font-size:16px;color:#111827">Dados do Projeto</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
        <tbody>
          ${(() => {
            const half = Math.ceil(metaEntries.length / 2);
            const col1 = metaEntries.slice(0, half);
            const col2 = metaEntries.slice(half);
            const rows = Math.max(col1.length, col2.length);
            let html = '';
            for (let i = 0; i < rows; i++) {
              const left = col1[i];
              const right = col2[i];
              html += `
                <tr>
                  ${left ? `<td style="padding:8px;font-weight:bold;background:#f3f4f6;width:20%">${left.label}:</td><td style="padding:8px;border-left:1px solid #e5e7eb">${left.value}</td>` : `<td style="padding:8px;background:#f3f4f6;width:20%"></td><td style="padding:8px;border-left:1px solid #e5e7eb"></td>`}
                  ${right ? `<td style="padding:8px;font-weight:bold;background:#f3f4f6;width:20%;border-left:1px solid #e5e7eb">${right.label}:</td><td style="padding:8px;border-left:1px solid #e5e7eb">${right.value}</td>` : `<td style="padding:8px;background:#f3f4f6;width:20%;border-left:1px solid #e5e7eb"></td><td style="padding:8px;border-left:1px solid #e5e7eb"></td>`}
                </tr>
              `;
            }
            return html;
          })()}
        </tbody>
      </table>
    </section>
  ` : '';

  return `<!doctype html><html lang="pt-BR"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Homolog Report</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto;background:#ffffff;color:#111827;margin:20px}
      .docx-container{width:${CONTENT_WIDTH_CM}cm;margin:0 auto}
      h1{font-size:20px;margin:0 0 12px}
    </style>
  </head><body>
    <div class="docx-container">
      <h1>Homolog Report</h1>
      ${projectMetaHtml}
      <section>
        <h2 style="margin:0 0 12px;font-size:16px;color:#111827">Passos</h2>
        ${stepsHtml || '<p style="color:#6b7280">Nenhum passo.</p>'}
      </section>
    </div>
  </body></html>`;
}

/**
 * Baixa HTML como arquivo
 * @param {Array} steps - Lista de passos
 * @param {Object} projectData - Dados do projeto
 */
export function downloadHtml(steps, projectData = {}) {
  try {
    const now = new Date();
    const html = buildExportHtml(steps, projectData);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homolog_${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
    showToast('HTML baixado');
  } catch (e) {
    console.warn('Falha ao baixar HTML:', e);
    showToast('Não foi possível gerar o HTML');
  }
}

/**
 * Converte Data URL para ArrayBuffer
 * @private
 */
export async function dataUrlToArrayBuffer(dataUrl) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return await blob.arrayBuffer();
}

/**
 * Obtém dimensões de uma imagem
 * @private
 */
export function getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () =>
            resolve({
                width: img.naturalWidth || img.width || 1920,
                height: img.naturalHeight || img.height || 1080,
            });
        img.onerror = () => resolve({ width: 1920, height: 1080 });
        img.src = dataUrl;
    });
}

/**
 * Redimensiona imagem para caber nos limites
 * @private
 */
export async function resizeImageToFit(dataUrl, maxWpx, maxHpx) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = async () => {
            const srcW = img.naturalWidth || img.width;
            const srcH = img.naturalHeight || img.height;
            const scale = Math.min(maxWpx / srcW, maxHpx / srcH, 1);
            const targetW = Math.round(srcW * scale);
            const targetH = Math.round(srcH * scale);

            if (scale >= 1) {
                try {
                    const blob = await (await fetch(dataUrl)).blob();
                    const buffer = await blob.arrayBuffer();
                    resolve({ buffer, width: srcW, height: srcH });
                } catch (e) {
                    resolve({ buffer: new ArrayBuffer(0), width: srcW, height: srcH });
                }
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                const blob = await (await fetch(dataUrl)).blob();
                const buffer = await blob.arrayBuffer();
                resolve({ buffer, width: srcW, height: srcH });
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetW, targetH);

            canvas.toBlob(
                async (blob) => {
                    if (!blob) {
                        const originalBlob = await (await fetch(dataUrl)).blob();
                        const buffer = await originalBlob.arrayBuffer();
                        resolve({ buffer, width: srcW, height: srcH });
                        return;
                    }
                    const buffer = await blob.arrayBuffer();
                    resolve({ buffer, width: targetW, height: targetH });
                },
                'image/jpeg',
                0.9
            );
        };
        img.onerror = async () => {
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const buffer = await blob.arrayBuffer();
                resolve({ buffer, width: maxWpx, height: maxHpx });
            } catch (e) {
                resolve({ buffer: new ArrayBuffer(0), width: maxWpx, height: maxHpx });
            }
        };
        img.src = dataUrl;
    });
}

/**
 * Baixa DOCX como arquivo (A4 retrato)
 * - Imagens dimensionadas mantendo proporção até no máximo 21cm x 29.7cm
 * @param {Array} steps
 * @param {Object} projectData
 */
export async function downloadDocx(steps, projectData = {}) {
  try {
    const maxWcm = 21.0;
    const maxHcm = 29.7;

    const children = [];

    // Título
    children.push(
      new Paragraph({
        text: 'Homolog Report',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      })
    );

    // Metadados do projeto em tabela
    if (projectData.projectName || projectData.frontName || projectData.distributorName || projectData.responsible || projectData.projectDate || projectData.expectedResult) {
      const metaEntriesDocx = [
        { label: 'Projeto', value: projectData.projectName || '(não preenchido)' },
        { label: 'Frente', value: projectData.frontName || '(não preenchido)' },
        { label: 'Distribuidora', value: projectData.distributorName || '(não preenchido)' },
        { label: 'Responsável', value: projectData.responsible || '(não preenchido)' },
        { label: 'Data', value: projectData.projectDate || '(não preenchido)' },
        { label: 'Resultado Esperado', value: projectData.expectedResult || '(não preenchido)' },
      ];

      children.push(new Paragraph({ text: ' ' }));
      children.push(new Paragraph({ text: 'Dados do Projeto', heading: HeadingLevel.HEADING_2 }));

      children.push(
        new Table({
          rows: metaEntriesDocx.map((entry) =>
            new TableRow({
              children: [
                new TableCell({ children: [ new Paragraph({ text: `${entry.label}:`, }) ] }),
                new TableCell({ children: [ new Paragraph({ text: entry.value }) ] }),
              ],
            })
          ),
        })
      );

      children.push(new Paragraph({ text: ' ' }));
    }

    if (!steps?.length) {
      children.push(new Paragraph({ text: 'Nenhum passo.' }));
    } else {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const stepNum = i + 1;

        // Cabeçalho do passo
        children.push(new Paragraph({
          text: `Passo ${stepNum} — ${s.title || ''}`.trim(),
          heading: HeadingLevel.HEADING_2,
        }));

        if (s.tag) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'Item clicado: ', bold: true }),
                new TextRun({ text: s.tag }),
              ],
            })
          );
        }

        if (s.description) {
          children.push(new Paragraph({ text: s.description }));
        }

        if (s.imageDataUrl) {
          // Obter dimensões para calcular proporção
          const dim = await getImageDimensions(s.imageDataUrl);
          const ratio = dim.width && dim.height ? dim.width / dim.height : 16 / 9;

          // Ajuste para caber em 21x29.7 cm mantendo proporção
          let targetWcm = maxWcm;
          let targetHcm = targetWcm / ratio;
          if (targetHcm > maxHcm) {
            targetHcm = maxHcm;
            targetWcm = targetHcm * ratio;
          }

          const imgBuffer = await dataUrlToArrayBuffer(s.imageDataUrl);

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: new Uint8Array(imgBuffer),
                  transformation: {
                    width: cmToEmu(targetWcm),
                    height: cmToEmu(targetHcm),
                  },
                }),
              ],
            })
          );
        }

        // Espaço entre passos
        children.push(new Paragraph({ text: ' ' }));
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: {
                width: cmToTwip(21.0),
                height: cmToTwip(29.7),
              },
              margin: {
                top: cmToTwip(2.0),
                right: cmToTwip(2.0),
                bottom: cmToTwip(2.0),
                left: cmToTwip(2.0),
              },
            },
          },
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const now = new Date();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homolog_${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.docx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
    showToast('DOCX baixado');
  } catch (e) {
    console.warn('Falha ao gerar DOCX, usando HTML fallback:', e);
    showToast('Falha no DOCX; baixando HTML');
    try {
      downloadHtml(steps, projectData);
    } catch (htmlErr) {
      console.warn('Fallback HTML também falhou:', htmlErr);
      showToast('Não foi possível exportar');
    }
  }

}

