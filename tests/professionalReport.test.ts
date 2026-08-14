import { describe, expect, it } from 'vitest';
import { buildProfessionalHtml, createProfessionalPdf, escapeHtml, safeFilename, statusSummary } from '../web/src/core/modules/professionalReport';
import type { EvidenceProject, EvidenceStep } from '../web/src/core/modules/evidenceStore';

const project: EvidenceProject = { id:'p',name:'Projeto <QA>',feature:'Login',environment:'HML',version:'1.2',responsible:'Felipe',date:'2026-08-13',browser:'Chrome',expectedResult:'Entrar',overallResult:'Aprovado',createdAt:1,updatedAt:1 };
const step=(sequence=1):EvidenceStep=>({id:`s${sequence}`,sessionId:'x',projectId:'p',sequence,title:`Passo ${sequence}`,action:'Clicar',element:'Botão Entrar',description:'Texto '.repeat(sequence),expectedResult:'Sucesso',actualResult:'Sucesso',status:sequence%2?'passed':'failed',url:'https://example.com/?x=<script>',timestamp:Date.now(),screenshotId:null});
const options={includeUrls:true,includeTechnicalData:true,hideSensitive:true};

describe('relatórios profissionais',()=>{
  it('sanitiza conteúdo HTML',()=>expect(escapeHtml('<script>alert(1)</script>')).not.toContain('<script>'));
  it('gera nomes seguros',()=>expect(safeFilename('Relatório: QA / Login','pdf')).toBe('Relatorio-QA-Login.pdf'));
  it('aceita dados ausentes e sessão vazia',()=>expect(buildProfessionalHtml({...project,feature:''},[],options)).toContain('Nenhum passo'));
  it('resume status',()=>expect(statusSummary([step(1),step(2)])).toMatchObject({passed:1,failed:1}));
  it('escapa URL e conteúdo',()=>{const html=buildProfessionalHtml(project,[step()],options);expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');});
  it('gera HTML com muitos passos e textos extensos',()=>expect(buildProfessionalHtml(project,Array.from({length:80},(_,i)=>step(i+1)),options)).toContain('Total de passos'));
  it('gera PDF válido para sessão vazia',()=>expect(createProfessionalPdf(project,[],options).type).toBe('application/pdf'));
  it('gera PDF de múltiplas páginas',()=>expect(createProfessionalPdf(project,Array.from({length:35},(_,i)=>step(i+1)),options).size).toBeGreaterThan(1000));
});
