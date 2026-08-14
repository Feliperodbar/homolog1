import { jsPDF } from 'jspdf';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import type { EvidenceProject, EvidenceStep, StepStatus } from './evidenceStore';

export interface ReportOptions {
  includeUrls: boolean;
  includeTechnicalData: boolean;
  hideSensitive: boolean;
}

export interface ReportStep extends EvidenceStep { screenshotDataUrl?: string | null }

const STATUS_LABELS: Record<StepStatus, string> = {
  'not-run': 'Não executado', passed: 'Aprovado', failed: 'Reprovado', blocked: 'Bloqueado', skipped: 'Ignorado',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function safeFilename(value: string, extension: string): string {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'homolog-relatorio';
  return `${base}.${extension.replace(/^\./, '')}`;
}

export function statusSummary(steps: ReportStep[]): Record<StepStatus, number> {
  return steps.reduce((summary, step) => { summary[step.status] += 1; return summary; }, { 'not-run': 0, passed: 0, failed: 0, blocked: 0, skipped: 0 });
}

export function buildProfessionalHtml(project: EvidenceProject, steps: ReportStep[], options: ReportOptions): string {
  const summary = statusSummary(steps);
  const cards = steps.map((step) => {
    const technical = options.includeTechnicalData && step.technicalData ? `<pre>${escapeHtml(JSON.stringify(step.technicalData, null, 2))}</pre>` : '';
    const image = !options.hideSensitive || !step.sensitive ? step.screenshotDataUrl : null;
    return `<article class="step"><header><span class="number">${step.sequence}</span><div><h3>${escapeHtml(step.title || step.action)}</h3><span class="status ${step.status}">${escapeHtml(STATUS_LABELS[step.status])}</span></div></header>${image ? `<img src="${image}" alt="Screenshot do passo ${step.sequence}">` : step.sensitive ? '<p class="redacted">Screenshot ocultada por conter informação sensível.</p>' : ''}<dl><dt>Ação</dt><dd>${escapeHtml(step.action)}</dd><dt>Elemento</dt><dd>${escapeHtml(step.element)}</dd><dt>Descrição</dt><dd>${escapeHtml(step.description)}</dd><dt>Resultado esperado</dt><dd>${escapeHtml(step.expectedResult)}</dd><dt>Resultado obtido</dt><dd>${escapeHtml(step.actualResult)}</dd>${options.includeUrls ? `<dt>URL</dt><dd>${escapeHtml(step.url)}</dd>` : ''}<dt>Horário</dt><dd>${escapeHtml(new Date(step.timestamp).toLocaleString('pt-BR'))}</dd></dl>${technical}</article>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(project.name)} - Evidências QA</title><style>@page{margin:18mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172033;margin:0}h1{font-size:24px;margin:0}.meta,.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:18px 0}.box{border:1px solid #d9dfeb;padding:10px;border-radius:6px}.summary{grid-template-columns:repeat(5,1fr)}.summary .box{text-align:center}.summary strong{display:block;font-size:20px}.step{break-inside:avoid;border-top:2px solid #263b66;padding:16px 0}.step header{display:flex;gap:10px;align-items:center}.number{background:#263b66;color:white;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;font-weight:bold}.step h3{margin:0 0 4px}.status{font-weight:bold}.passed{color:#157347}.failed{color:#b42318}.blocked{color:#9a6700}.skipped{color:#667085}.step img{display:block;max-width:100%;max-height:145mm;object-fit:contain;margin:12px auto;border:1px solid #d9dfeb}dl{display:grid;grid-template-columns:130px 1fr;margin:8px 0}dt{font-weight:bold}dd{margin:0 0 6px;overflow-wrap:anywhere}.redacted{padding:28px;text-align:center;background:#eef1f6}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fb;padding:8px}</style></head><body><h1>Relatório de Evidências QA</h1><p>Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p><section class="meta">${[['Projeto',project.name],['Funcionalidade',project.feature],['Ambiente',project.environment],['Versão/build',project.version],['Responsável',project.responsible],['Data',project.date],['Navegador',project.browser],['Resultado geral',project.overallResult]].map(([label,value])=>`<div class="box"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value || 'Não informado')}</div>`).join('')}</section><h2>Resumo da execução</h2><section class="summary">${(Object.keys(summary) as StepStatus[]).map(status=>`<div class="box"><strong>${summary[status]}</strong>${escapeHtml(STATUS_LABELS[status])}</div>`).join('')}</section><p>Total de passos: <strong>${steps.length}</strong></p>${cards || '<p>Nenhum passo registrado nesta sessão.</p>'}</body></html>`;
}

function download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }

export function downloadProfessionalHtml(project: EvidenceProject, steps: ReportStep[], options: ReportOptions): void {
  download(new Blob([buildProfessionalHtml(project, steps, options)], { type: 'text/html;charset=utf-8' }), safeFilename(project.name, 'html'));
}

export async function downloadProfessionalDocx(project: EvidenceProject, steps: ReportStep[], options: ReportOptions): Promise<void> {
  const children: Paragraph[] = [new Paragraph({ text: 'Relatório de Evidências QA', heading: HeadingLevel.TITLE }), new Paragraph({ text: `Projeto: ${project.name}` }), new Paragraph({ text: `Funcionalidade: ${project.feature || 'Não informado'}` }), new Paragraph({ text: `Ambiente: ${project.environment || 'Não informado'} | Versão: ${project.version || 'Não informada'}` }), new Paragraph({ text: `Responsável: ${project.responsible || 'Não informado'} | Resultado geral: ${project.overallResult || 'Não informado'}` }), new Paragraph({ text: `Total de passos: ${steps.length}`, heading: HeadingLevel.HEADING_2 })];
  for (const step of steps) {
    children.push(new Paragraph({ text: `Passo ${step.sequence} - ${step.title || step.action}`, heading: HeadingLevel.HEADING_2 }), new Paragraph({ children: [new TextRun({ text: 'Status: ', bold: true }), new TextRun(STATUS_LABELS[step.status])] }), new Paragraph({ text: step.description || 'Sem descrição.' }), new Paragraph({ text: `Esperado: ${step.expectedResult || 'Não informado'}` }), new Paragraph({ text: `Obtido: ${step.actualResult || 'Não informado'}` }));
    if (options.includeUrls && step.url) children.push(new Paragraph({ text: `URL: ${step.url}` }));
    if (step.screenshotDataUrl && (!options.hideSensitive || !step.sensitive)) {
      const bytes = new Uint8Array(await (await fetch(step.screenshotDataUrl)).arrayBuffer());
      children.push(new Paragraph({ children: [new ImageRun({ data: bytes, transformation: { width: 620, height: 350 } })] }));
    }
  }
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
  download(await Packer.toBlob(doc), safeFilename(project.name, 'docx'));
}

export function createProfessionalPdf(project: EvidenceProject, steps: ReportStep[], options: ReportOptions): Blob {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const width = 210; const margin = 16; const usable = width - margin * 2; let y = 18;
  const line = (text: string, size = 10, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); const rows = pdf.splitTextToSize(text || 'Não informado', usable); if (y + rows.length * 5 > 282) { pdf.addPage(); y = 18; } pdf.text(rows, margin, y); y += rows.length * 5 + 2; };
  line('Relatório de Evidências QA', 18, true); line(`Projeto: ${project.name}`, 12, true); line(`Funcionalidade: ${project.feature}`); line(`Ambiente: ${project.environment} | Versão: ${project.version}`); line(`Responsável: ${project.responsible} | Resultado geral: ${project.overallResult}`);
  const summary = statusSummary(steps); line(`Resumo: ${Object.entries(summary).map(([key,value])=>`${STATUS_LABELS[key as StepStatus]} ${value}`).join(' | ')}`, 9); line(`Total de passos: ${steps.length}`, 11, true);
  for (const step of steps) {
    if (y > 245) { pdf.addPage(); y = 18; }
    pdf.setDrawColor(38, 59, 102); pdf.line(margin, y, width - margin, y); y += 7;
    line(`Passo ${step.sequence} - ${step.title || step.action}`, 12, true); line(`Status: ${STATUS_LABELS[step.status]}`, 9, true); line(step.description || 'Sem descrição.'); line(`Esperado: ${step.expectedResult || 'Não informado'}`); line(`Obtido: ${step.actualResult || 'Não informado'}`); if (options.includeUrls && step.url) line(`URL: ${step.url}`, 8);
    if (step.screenshotDataUrl && (!options.hideSensitive || !step.sensitive)) {
      try { const format = step.screenshotDataUrl.includes('image/png') ? 'PNG' : 'JPEG'; const props = pdf.getImageProperties(step.screenshotDataUrl); const h = Math.min(100, usable * props.height / props.width); if (y + h > 282) { pdf.addPage(); y = 18; } pdf.addImage(step.screenshotDataUrl, format, margin, y, usable, h, undefined, 'FAST'); y += h + 6; } catch { line('[Imagem indisponível]', 8); }
    }
  }
  const pages = pdf.getNumberOfPages(); for (let i = 1; i <= pages; i += 1) { pdf.setPage(i); pdf.setFontSize(8); pdf.text(`Homolog - Página ${i} de ${pages}`, 105, 292, { align: 'center' }); }
  return pdf.output('blob');
}

export function downloadProfessionalPdf(project: EvidenceProject, steps: ReportStep[], options: ReportOptions): void { download(createProfessionalPdf(project, steps, options), safeFilename(project.name, 'pdf')); }
